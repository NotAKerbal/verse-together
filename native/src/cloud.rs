// Signing in to a Verse Together account from the desktop, and talking to its servers. RFC 8252 loopback flow:
// the app listens on 127.0.0.1, opens the website's /native/authorize page in the system browser with a PKCE (S256)
// challenge and a random state, the reader approves there while signed in, and the website hands a single-use code
// to this listener. Only this process holds the verifier, so only it can exchange the code for its own session
// (convex/nativeAuth.ts). The session token is kept in the OS credential store, never in files or logs, bound to the
// website, the Convex deployment and this study profile, and is sent only to that website as a bearer token; Convex
// calls use the short-lived JWT the website issues for it.
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub const DEFAULT_SITE: &str = "https://www.versetogether.org";
/// The production Convex deployment the website uses (docs/convex-deployment.md).
pub const DEFAULT_CONVEX: &str = "https://lovable-seal-140.convex.cloud";
const KEYRING_SERVICE: &str = "app.versetogether.native";
const SIGN_IN_WAIT: Duration = Duration::from_secs(300);
pub const SIGNED_OUT: &str = "Your session has ended. Sign in again to keep syncing.";

/// Why a call to the account's servers didn't succeed.
#[derive(Debug, Clone, PartialEq)]
pub enum CallError {
    /// The session is no longer valid (HTTP 401/403).
    SignedOut,
    /// The server couldn't be reached or failed for now; trying again later may work.
    Unavailable(String),
    /// The server refused this request. `code` is a ConvexError's code (such as `REVISION_CONFLICT`).
    Refused {
        message: String,
        code: Option<String>,
        data: serde_json::Value,
    },
    /// Stopped because the account it was for was signed out or switched.
    Cancelled,
}
impl CallError {
    pub fn code(&self) -> Option<&str> {
        match self {
            Self::Refused { code, .. } => code.as_deref(),
            _ => None,
        }
    }
    pub fn refused(message: impl Into<String>) -> Self {
        Self::Refused {
            message: message.into(),
            code: None,
            data: serde_json::Value::Null,
        }
    }
    /// Whether the request may have been carried out even though no reply came back.
    pub fn may_have_applied(&self) -> bool {
        matches!(self, Self::Unavailable(_))
    }
}
impl std::fmt::Display for CallError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::SignedOut => f.write_str(SIGNED_OUT),
            Self::Unavailable(m) => write!(f, "Verse Together couldn't be reached: {m}"),
            Self::Refused { message, .. } => f.write_str(message),
            Self::Cancelled => f.write_str("Stopped because you signed out."),
        }
    }
}
impl From<CallError> for String {
    fn from(e: CallError) -> Self {
        e.to_string()
    }
}

/// An origin the app may talk to: `https://host[:port]`, or plain http only on this computer (for development).
pub fn validate_origin(value: &str) -> Result<String, String> {
    let value = value.trim().trim_end_matches('/');
    let problem = || format!("“{value}” isn't a usable server address.");
    let (scheme, rest) = value.split_once("://").ok_or_else(problem)?;
    let scheme = scheme.to_ascii_lowercase();
    if rest.is_empty() || rest.contains(['/', '?', '#', '@', '\\', ' ']) {
        return Err(problem());
    }
    let rest = rest.to_ascii_lowercase();
    let (host, port) = match rest.strip_prefix('[') {
        Some(bracketed) => {
            let (h, tail) = bracketed.split_once(']').ok_or_else(problem)?;
            if !tail.is_empty() && !tail.starts_with(':') {
                return Err(problem());
            }
            (format!("[{h}]"), tail.strip_prefix(':').map(str::to_string))
        }
        None => match rest.split_once(':') {
            Some((h, p)) => (h.to_string(), Some(p.to_string())),
            None => (rest.clone(), None),
        },
    };
    if port
        .as_ref()
        .is_some_and(|p| p.is_empty() || p.len() > 5 || !p.chars().all(|c| c.is_ascii_digit()))
    {
        return Err(problem());
    }
    let local = matches!(host.as_str(), "127.0.0.1" | "localhost" | "[::1]");
    let host_ok = local
        || (!host.is_empty()
            && !host.starts_with(['.', '-'])
            && host.contains('.')
            && host
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-'));
    match scheme.as_str() {
        "https" if host_ok => {}
        "http" if local => {}
        "http" => {
            return Err(format!(
                "“{value}” must use https (plain http is only allowed for this computer)."
            ));
        }
        _ => return Err(problem()),
    }
    Ok(match port {
        Some(p) => format!("{scheme}://{host}:{p}"),
        None => format!("{scheme}://{host}"),
    })
}

/// Where the account lives: the website (sign-in, session, Convex JWTs) and its Convex deployment.
#[derive(Debug, Clone, PartialEq)]
pub struct Endpoints {
    pub site: String,
    pub convex: String,
}
impl Endpoints {
    pub fn production() -> Self {
        Self {
            site: DEFAULT_SITE.into(),
            convex: DEFAULT_CONVEX.into(),
        }
    }
    pub fn new(site: &str, convex: &str) -> Result<Self, String> {
        Ok(Self {
            site: validate_origin(site)?,
            convex: validate_origin(convex)?,
        })
    }
    /// Production, or a preview deployment named by both `VERSE_TOGETHER_SITE` and `VERSE_TOGETHER_CONVEX_URL`
    /// (they must belong together; one without the other is refused rather than mixing deployments).
    pub fn from_env() -> Result<Self, String> {
        let site = std::env::var("VERSE_TOGETHER_SITE").ok();
        let convex = std::env::var("VERSE_TOGETHER_CONVEX_URL").ok();
        match (site, convex) {
            (None, None) => Ok(Self::production()),
            (Some(site), Some(convex)) => Self::new(&site, &convex),
            _ => Err("Set both VERSE_TOGETHER_SITE and VERSE_TOGETHER_CONVEX_URL to use another deployment. Account features are off until then.".into()),
        }
    }
    /// Native auth uses the configured Convex deployment's public HTTP actions. Browser approval stays on the
    /// website. This keeps Vercel preview protection intact without requiring its browser cookie in the app.
    /// Custom/self-hosted and loopback deployments retain their website proxy.
    pub fn auth_origin(&self) -> String {
        if let Some(name) = self
            .convex
            .strip_prefix("https://")
            .and_then(|s| s.strip_suffix(".convex.cloud"))
            .filter(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-'))
        {
            format!("https://{name}.convex.site")
        } else {
            self.site.clone()
        }
    }
    /// The credential entry for this deployment and study profile: another deployment or profile never sees (or
    /// sends) this one's session.
    pub fn credential_scope(&self, profile: &Path) -> String {
        let profile = std::fs::canonicalize(profile).unwrap_or_else(|_| profile.to_path_buf());
        let digest = Sha256::digest(
            format!(
                "{}\n{}\n{}",
                self.site,
                self.convex,
                profile.to_string_lossy()
            )
            .as_bytes(),
        );
        let hex: String = digest[..16].iter().map(|b| format!("{b:02x}")).collect();
        format!("session-v2-{hex}")
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AccountUser {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub email: String,
}
/// A signed-in account: who, and this app's own session token.
#[derive(Clone, PartialEq, Serialize, Deserialize)]
pub struct Session {
    pub user: AccountUser,
    token: String,
}
impl std::fmt::Debug for Session {
    // The token never appears in logs or error messages.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Session")
            .field("user", &self.user)
            .finish_non_exhaustive()
    }
}
impl Session {
    #[cfg(test)]
    pub fn token(&self) -> &str {
        &self.token
    }
    #[cfg(test)]
    pub fn for_test(user: AccountUser, token: &str) -> Self {
        Self {
            user,
            token: token.into(),
        }
    }
    pub fn same_session(&self, other: &Session) -> bool {
        equal(&self.token, &other.token)
    }
}

/// Where a session's secret is kept. The real store is the OS credential store; tests and `--no-account` profiles
/// use others, so nothing a test does can touch a person's saved sign-in.
pub trait Credentials: Send + Sync {
    fn load(&self) -> Result<Option<String>, String>;
    fn save(&self, secret: &str) -> Result<(), String>;
    fn delete(&self) -> Result<(), String>;
}
/// The OS credential store (Secret Service, Keychain, Credential Manager), one entry per deployment and profile.
pub struct Keyring {
    entry: String,
}
impl Keyring {
    pub fn new(scope: String) -> Self {
        Self { entry: scope }
    }
    fn entry(&self) -> Result<keyring::Entry, String> {
        keyring::Entry::new(KEYRING_SERVICE, &self.entry).map_err(|e| e.to_string())
    }
}
impl Credentials for Keyring {
    fn load(&self) -> Result<Option<String>, String> {
        match self.entry()?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("The system keyring isn't available: {e}")),
        }
    }
    fn save(&self, secret: &str) -> Result<(), String> {
        self.entry()?.set_password(secret).map_err(|e| {
            format!("The system keyring isn't available, so you'd be signed out when the app closes: {e}")
        })
    }
    fn delete(&self) -> Result<(), String> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}
/// Kept only in memory, for tests.
#[derive(Default)]
pub struct Memory(pub Mutex<Option<String>>);
impl Credentials for Memory {
    fn load(&self) -> Result<Option<String>, String> {
        Ok(self.0.lock().unwrap().clone())
    }
    fn save(&self, secret: &str) -> Result<(), String> {
        *self.0.lock().unwrap() = Some(secret.into());
        Ok(())
    }
    fn delete(&self) -> Result<(), String> {
        *self.0.lock().unwrap() = None;
        Ok(())
    }
}

/// A saved session, with the deployment it belongs to.
#[derive(Serialize, Deserialize)]
struct Stored {
    site: String,
    convex: String,
    session: Session,
}
pub fn load_session(
    credentials: &dyn Credentials,
    endpoints: &Endpoints,
) -> Result<Option<Session>, String> {
    let Some(secret) = credentials.load()? else {
        return Ok(None);
    };
    Ok(serde_json::from_str::<Stored>(&secret)
        .ok()
        .filter(|s| s.site == endpoints.site && s.convex == endpoints.convex)
        .map(|s| s.session))
}
pub fn store_session(
    credentials: &dyn Credentials,
    endpoints: &Endpoints,
    session: &Session,
) -> Result<(), String> {
    let stored = Stored {
        site: endpoints.site.clone(),
        convex: endpoints.convex.clone(),
        session: session.clone(),
    };
    credentials.save(&serde_json::to_string(&stored).map_err(|e| e.to_string())?)
}
/// Forgets the saved session only if it is still `session` (a newer sign-in's is left alone).
pub fn forget_session(
    credentials: &dyn Credentials,
    endpoints: &Endpoints,
    session: &Session,
) -> Result<(), String> {
    match load_session(credentials, endpoints) {
        Ok(Some(saved)) if !saved.same_session(session) => Ok(()),
        _ => credentials.delete(),
    }
}

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}
fn random(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    getrandom::fill(&mut buf).expect("system randomness");
    b64(&buf)
}
pub fn challenge_for(verifier: &str) -> String {
    b64(&Sha256::digest(verifier.as_bytes()))
}
/// One sign-in attempt's secrets.
pub struct Pkce {
    pub verifier: String,
    pub challenge: String,
    pub state: String,
}
impl Pkce {
    pub fn new() -> Self {
        let verifier = random(32);
        Self {
            challenge: challenge_for(&verifier),
            verifier,
            state: random(16),
        }
    }
}
fn equal(a: &str, b: &str) -> bool {
    a.len() == b.len()
        && a.bytes()
            .zip(b.bytes())
            .fold(0u8, |acc, (x, y)| acc | (x ^ y))
            == 0
}
fn query_value(query: &str, key: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        (k == key).then(|| percent_decode(v))
    })
}
fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let hex = (bytes[i] == b'%' && i + 3 <= bytes.len())
            .then(|| std::str::from_utf8(&bytes[i + 1..i + 3]).ok())
            .flatten()
            .and_then(|h| u8::from_str_radix(h, 16).ok());
        match (hex, bytes[i]) {
            (Some(b), _) => {
                out.push(b);
                i += 3;
                continue;
            }
            (None, b'+') => out.push(b' '),
            (None, b) => out.push(b),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
/// What the browser brought back to the listener for this attempt.
#[derive(Debug, PartialEq)]
pub enum Callback {
    Code(String),
    /// The reader chose Cancel on the approval page.
    Declined,
}
/// The browser's request to the listener, when it is the callback for this attempt (its state matches).
pub fn callback(request_line: &str, state: &str) -> Option<Callback> {
    let mut parts = request_line.split_whitespace();
    if parts.next()? != "GET" {
        return None;
    }
    let target = parts.next()?;
    let query = target.strip_prefix("/callback?")?;
    let returned = query_value(query, "state")?;
    if !equal(&returned, state) {
        return None;
    }
    if query_value(query, "error").as_deref() == Some("access_denied") {
        return Some(Callback::Declined);
    }
    query_value(query, "code")
        .filter(|c| !c.is_empty() && c.len() <= 128)
        .map(Callback::Code)
}
fn respond(mut stream: TcpStream, status: &str, body: &str) {
    let page = format!(
        "<!doctype html><meta charset=utf-8><title>Verse Together</title><body style=\"font-family:sans-serif;background:#f6f3ec;color:#1f1d1a;display:grid;place-items:center;height:90vh\"><p>{body}</p>"
    );
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{page}",
        page.len()
    );
}
pub const SIGN_IN_CANCELLED: &str = "Sign-in was cancelled.";
pub const SIGN_IN_DECLINED: &str =
    "The desktop app wasn't approved in the browser. Start again when you're ready.";
/// Waits on the loopback listener for this attempt's callback, answering anything else with 404.
fn wait_for_code(
    listener: &TcpListener,
    state: &str,
    cancel: &AtomicBool,
) -> Result<String, String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + SIGN_IN_WAIT;
    while Instant::now() < deadline {
        if cancel.load(Ordering::Relaxed) {
            return Err(SIGN_IN_CANCELLED.into());
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_nonblocking(false);
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut buffer = [0u8; 4096];
                // TCP may split the request line across reads. Do not reject a valid callback merely because
                // its state or code arrived in the next packet; keep the line bounded and the read timeout.
                let mut read = 0;
                while read < buffer.len() && !buffer[..read].contains(&b'\n') {
                    match stream.read(&mut buffer[read..]) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => read += n,
                    }
                }
                let request = String::from_utf8_lossy(&buffer[..read]);
                let line = request.lines().next().unwrap_or("");
                match callback(line, state) {
                    Some(Callback::Code(code)) => {
                        respond(
                            stream,
                            "200 OK",
                            "Signed in. You can close this tab and return to Verse Together.",
                        );
                        return Ok(code);
                    }
                    Some(Callback::Declined) => {
                        respond(stream, "200 OK", "Not approved. You can close this tab.");
                        return Err(SIGN_IN_DECLINED.into());
                    }
                    None => respond(
                        stream,
                        "404 Not Found",
                        "This isn't the sign-in you started.",
                    ),
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(150));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("Sign-in timed out. Start again when you're ready.".into())
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(30)))
        .http_status_as_error(false)
        .build()
        .into()
}
fn read_json<T: for<'de> Deserialize<'de>>(
    response: Result<ureq::http::Response<ureq::Body>, ureq::Error>,
    what: &str,
) -> Result<T, CallError> {
    let mut response = response.map_err(|e| CallError::Unavailable(format!("{what}: {e}")))?;
    let status = response.status().as_u16();
    if status == 401 || status == 403 {
        return Err(CallError::SignedOut);
    }
    if status == 404 {
        return Err(CallError::refused(format!(
            "Verse Together's server doesn't offer this to the desktop app yet ({what} returned 404)."
        )));
    }
    if status == 429 || status >= 500 {
        return Err(CallError::Unavailable(format!(
            "{what} returned HTTP {status}"
        )));
    }
    if !(200..300).contains(&status) {
        return Err(CallError::refused(format!(
            "Verse Together's server refused {what} (HTTP {status})."
        )));
    }
    response
        .body_mut()
        .read_json()
        .map_err(|e| CallError::Unavailable(format!("unexpected reply to {what}: {e}")))
}

#[derive(Deserialize)]
struct TokenReply {
    token: String,
    user: AccountUser,
}

/// The whole sign-in: listen, open the browser (via `open`), wait for approval, exchange the code. A session that
/// arrives after the attempt was cancelled is ended on the server rather than kept.
pub fn sign_in(
    endpoints: &Endpoints,
    cancel: Arc<AtomicBool>,
    open: impl FnOnce(&str) -> Result<(), String>,
) -> Result<Session, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let pkce = Pkce::new();
    let url = format!(
        "{}/native/authorize?challenge={}&state={}&port={port}",
        endpoints.site, pkce.challenge, pkce.state
    );
    open(&url)?;
    let code = wait_for_code(&listener, &pkce.state, &cancel)?;
    drop(listener);
    let reply: TokenReply = read_json(
        agent()
            .post(&format!(
                "{}/api/auth/native/token",
                endpoints.auth_origin()
            ))
            .send_json(serde_json::json!({ "code": code, "verifier": pkce.verifier })),
        "the sign-in exchange",
    )
    .map_err(|e| match e {
        CallError::SignedOut => "This sign-in has expired. Start again from the app.".to_string(),
        e => e.to_string(),
    })?;
    if reply.token.is_empty() || reply.user.id.is_empty() {
        return Err("The server's sign-in reply was incomplete.".into());
    }
    let session = Session {
        user: reply.user,
        token: reply.token,
    };
    if cancel.load(Ordering::Relaxed) {
        let _ = sign_out(endpoints, &session);
        return Err(SIGN_IN_CANCELLED.into());
    }
    Ok(session)
}

/// A short-lived Convex JWT for the session (`/api/auth/convex/token`).
pub fn convex_token(endpoints: &Endpoints, session: &Session) -> Result<String, CallError> {
    #[derive(Deserialize)]
    struct Reply {
        token: String,
    }
    let reply: Reply = read_json(
        agent()
            .get(&format!(
                "{}/api/auth/convex/token",
                endpoints.auth_origin()
            ))
            .header("Authorization", &format!("Bearer {}", session.token))
            .call(),
        "the account token",
    )?;
    Ok(reply.token)
}

/// Ends this app's session on the server (the website's own sessions are untouched).
pub fn sign_out(endpoints: &Endpoints, session: &Session) -> Result<(), String> {
    let response = agent()
        .post(&format!("{}/api/auth/sign-out", endpoints.auth_origin()))
        .header("Authorization", &format!("Bearer {}", session.token))
        .send_json(serde_json::json!({}))
        .map_err(|e| e.to_string())?;
    match response.status().as_u16() {
        200..=299 | 401 => Ok(()),
        status => Err(format!(
            "The server didn't end the session (HTTP {status})."
        )),
    }
}

/// The account as the website's Settings shows it (`AccountManager`): profile, sign-in methods and sessions.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct AccountDetails {
    pub name: String,
    pub email: String,
    pub email_verified: bool,
    /// Connected sign-in methods (`google`, `credential`).
    pub providers: Vec<String>,
    pub sessions: Vec<SessionInfo>,
    /// This app's own session.
    pub current: Option<String>,
}
#[derive(Debug, Clone, PartialEq)]
pub struct SessionInfo {
    pub id: String,
    pub device: String,
}
/// A session's device as the website describes it (`describeAgent`).
pub fn describe_agent(agent: Option<&str>) -> String {
    let Some(agent) = agent.filter(|a| !a.is_empty()) else {
        return "Unknown device".into();
    };
    if agent == "Verse Together desktop" {
        return "Verse Together desktop app".into();
    }
    let browser = if agent.contains("Edg/") {
        "Edge"
    } else if agent.contains("Chrome/") {
        "Chrome"
    } else if agent.contains("Firefox/") {
        "Firefox"
    } else if agent.contains("Safari/") {
        "Safari"
    } else {
        "Browser"
    };
    let os = if agent.contains("iPhone") || agent.contains("iPad") {
        "iOS"
    } else if agent.contains("Android") {
        "Android"
    } else if agent.contains("Mac OS X") {
        "macOS"
    } else if agent.contains("Windows") {
        "Windows"
    } else if agent.contains("Linux") {
        "Linux"
    } else {
        ""
    };
    if os.is_empty() {
        browser.into()
    } else {
        format!("{browser} on {os}")
    }
}
fn bearer_get(
    endpoints: &Endpoints,
    session: &Session,
    path: &str,
) -> Result<serde_json::Value, CallError> {
    read_json(
        agent()
            .get(&format!("{}/api/auth/{path}", endpoints.auth_origin()))
            .header("Authorization", &format!("Bearer {}", session.token))
            .call(),
        path,
    )
}
fn bearer_post(
    endpoints: &Endpoints,
    session: &Session,
    path: &str,
    body: serde_json::Value,
) -> Result<serde_json::Value, CallError> {
    read_json(
        agent()
            .post(&format!("{}/api/auth/{path}", endpoints.auth_origin()))
            .header("Authorization", &format!("Bearer {}", session.token))
            .send_json(body),
        path,
    )
}
pub fn account_details(
    endpoints: &Endpoints,
    session: &Session,
) -> Result<AccountDetails, CallError> {
    let current = bearer_get(endpoints, session, "get-session")?;
    if current.is_null() {
        return Err(CallError::SignedOut);
    }
    let accounts = bearer_get(endpoints, session, "list-accounts")?;
    let sessions = bearer_get(endpoints, session, "list-sessions")?;
    let text = |v: &serde_json::Value| v.as_str().unwrap_or("").to_string();
    Ok(AccountDetails {
        name: text(&current["user"]["name"]),
        email: text(&current["user"]["email"]),
        email_verified: current["user"]["emailVerified"] == true,
        providers: accounts
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|a| a["providerId"].as_str().map(str::to_string))
            .collect(),
        sessions: sessions
            .as_array()
            .into_iter()
            .flatten()
            .map(|s| SessionInfo {
                id: text(&s["id"]),
                device: describe_agent(s["userAgent"].as_str()),
            })
            .collect(),
        current: current["session"]["id"].as_str().map(str::to_string),
    })
}
/// Changes the account's display name (`authClient.updateUser`).
pub fn update_name(endpoints: &Endpoints, session: &Session, name: &str) -> Result<(), CallError> {
    bearer_post(
        endpoints,
        session,
        "update-user",
        serde_json::json!({ "name": name }),
    )
    .map(|_| ())
}
/// Signs the account out everywhere but this app (`authClient.revokeOtherSessions`).
pub fn revoke_other_sessions(endpoints: &Endpoints, session: &Session) -> Result<(), CallError> {
    bearer_post(
        endpoints,
        session,
        "revoke-other-sessions",
        serde_json::json!({}),
    )
    .map(|_| ())
}

/// The account's functions, as the sync calls them. The real one is Convex's HTTP API; tests use stand-ins.
pub trait Backend {
    fn query(&self, path: &str, args: serde_json::Value) -> Result<serde_json::Value, CallError>;
    fn mutation(&self, path: &str, args: serde_json::Value)
    -> Result<serde_json::Value, CallError>;
}

/// Calls a Convex query or mutation over its HTTP API with the account's JWT.
pub struct Convex {
    url: String,
    jwt: String,
    agent: ureq::Agent,
}
impl Convex {
    pub fn new(endpoints: &Endpoints, jwt: String) -> Self {
        Self {
            url: endpoints.convex.clone(),
            jwt,
            agent: agent(),
        }
    }
    fn call(
        &self,
        kind: &str,
        path: &str,
        args: serde_json::Value,
    ) -> Result<serde_json::Value, CallError> {
        let mut response = self
            .agent
            .post(&format!("{}/api/{kind}", self.url))
            .header("Authorization", &format!("Bearer {}", self.jwt))
            .send_json(serde_json::json!({ "path": path, "args": args, "format": "json" }))
            .map_err(|e| CallError::Unavailable(format!("{path}: {e}")))?;
        let status = response.status().as_u16();
        if status == 401 || status == 403 {
            return Err(CallError::SignedOut);
        }
        // Function errors come back as JSON whatever the status; anything else is the service being unavailable.
        let reply: serde_json::Value = match response.body_mut().read_json() {
            Ok(v) => v,
            Err(_) if status == 429 || status >= 500 => {
                return Err(CallError::Unavailable(format!("{path}: HTTP {status}")));
            }
            Err(e) => return Err(CallError::refused(format!("{path}: {e}"))),
        };
        match reply["status"].as_str() {
            Some("success") => {
                let mut value = reply["value"].clone();
                normalize_convex_numbers(&mut value);
                Ok(value)
            }
            Some("error") => {
                let message = reply["errorMessage"].as_str().unwrap_or("").to_string();
                let data = reply["errorData"].clone();
                if data["code"] == "UNAUTHENTICATED"
                    || message.contains("Uncaught Error: Unauthorized")
                {
                    return Err(CallError::SignedOut);
                }
                Err(CallError::Refused {
                    code: data["code"].as_str().map(str::to_string),
                    message: data["message"]
                        .as_str()
                        .map(str::to_string)
                        .unwrap_or(message),
                    data,
                })
            }
            _ if status == 429 || status >= 500 => {
                Err(CallError::Unavailable(format!("{path}: HTTP {status}")))
            }
            _ => Err(CallError::refused(format!(
                "{path}: unexpected reply (HTTP {status})"
            ))),
        }
    }
}

/// Convex's JSON HTTP format writes JavaScript numbers as floats (for example
/// `2.0`). Rust's integer accessors and typed models require integer JSON numbers.
/// Normalize only exactly representable safe integers; fractions stay unchanged.
fn normalize_convex_numbers(value: &mut serde_json::Value) {
    use serde_json::Value;
    match value {
        Value::Number(number) if number.is_f64() => {
            if let Some(n) = number.as_f64()
                && n.fract() == 0.0
                && n.abs() <= 9_007_199_254_740_991.0
            {
                *value = Value::from(n as i64);
            }
        }
        Value::Array(values) => values.iter_mut().for_each(normalize_convex_numbers),
        Value::Object(values) => values.values_mut().for_each(normalize_convex_numbers),
        _ => {}
    }
}
impl Backend for Convex {
    fn query(&self, path: &str, args: serde_json::Value) -> Result<serde_json::Value, CallError> {
        self.call("query", path, args)
    }
    fn mutation(
        &self,
        path: &str,
        args: serde_json::Value,
    ) -> Result<serde_json::Value, CallError> {
        self.call("mutation", path, args)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn convex_http_floats_are_read_as_integer_revisions_verses_and_models() {
        let mut wire: serde_json::Value = serde_json::from_str(
            r#"{"revision":2.0,"verses":[3.0],"mark":{"start":12.0,"end":19.0},"fraction":1.5,"tooLarge":1e20,"negative":-2.0}"#,
        ).unwrap();
        normalize_convex_numbers(&mut wire);
        assert_eq!(wire["revision"].as_i64(), Some(2));
        assert_eq!(wire["verses"][0].as_u64(), Some(3));
        assert_eq!(wire["negative"].as_i64(), Some(-2));
        #[derive(serde::Deserialize)]
        struct Range {
            start: usize,
            end: usize,
        }
        let mark: Range = serde_json::from_value(wire["mark"].clone()).unwrap();
        assert_eq!((mark.start, mark.end), (12, 19));
        assert_eq!(wire["fraction"].as_f64(), Some(1.5));
        assert!(wire["tooLarge"].is_f64());
    }
    #[test]
    fn native_auth_uses_only_the_configured_deployments_http_actions() {
        let production = Endpoints::production();
        assert_eq!(
            production.auth_origin(),
            "https://lovable-seal-140.convex.site"
        );
        let dev = Endpoints::new(
            "https://scripture-sharing-dev.vercel.app",
            "https://fabulous-dogfish-606.convex.cloud",
        )
        .unwrap();
        assert_eq!(
            dev.auth_origin(),
            "https://fabulous-dogfish-606.convex.site"
        );
        assert_eq!(dev.site, "https://scripture-sharing-dev.vercel.app");
        for host in [
            "https://example.com",
            "https://sub.example.convex.cloud",
            "http://127.0.0.1:3000",
        ] {
            let custom = Endpoints::new("http://localhost:3199", host).unwrap();
            assert_eq!(custom.auth_origin(), "http://localhost:3199");
        }
    }
    #[test]
    fn pkce_matches_rfc_7636() {
        assert_eq!(
            challenge_for("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
        let a = Pkce::new();
        let b = Pkce::new();
        assert_eq!(a.verifier.len(), 43);
        assert_eq!(a.challenge.len(), 43);
        assert!(a.state.len() >= 16);
        assert_ne!(a.verifier, b.verifier);
        assert_eq!(challenge_for(&a.verifier), a.challenge);
    }
    #[test]
    fn only_this_attempts_callback_is_accepted() {
        let state = "abcdefghijklmnopqrstuv";
        assert_eq!(
            callback(
                &format!("GET /callback?code=c0de%2D1&state={state} HTTP/1.1"),
                state
            ),
            Some(Callback::Code("c0de-1".into()))
        );
        assert_eq!(
            callback(
                &format!("GET /callback?error=access_denied&state={state} HTTP/1.1"),
                state
            ),
            Some(Callback::Declined)
        );
        assert!(
            callback(
                &format!("GET /callback?error=access_denied&state={state}x HTTP/1.1"),
                state
            )
            .is_none(),
            "a decline for another attempt is ignored"
        );
        assert!(
            callback(
                &format!("GET /callback?code=x&state={state}x HTTP/1.1"),
                state
            )
            .is_none()
        );
        assert!(callback("GET /callback?code=x HTTP/1.1", state).is_none());
        assert!(
            callback(
                &format!("POST /callback?code=x&state={state} HTTP/1.1"),
                state
            )
            .is_none()
        );
        assert!(callback(&format!("GET /other?code=x&state={state} HTTP/1.1"), state).is_none());
        assert!(
            !format!(
                "{:?}",
                Session::for_test(
                    AccountUser {
                        id: "u".into(),
                        name: String::new(),
                        email: String::new()
                    },
                    "secret-token"
                )
            )
            .contains("secret")
        );
    }
    #[test]
    fn devices_are_described_like_the_website() {
        assert_eq!(
            describe_agent(Some(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"
            )),
            "Chrome on Linux"
        );
        assert_eq!(
            describe_agent(Some(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
            )),
            "Safari on iOS"
        );
        assert_eq!(
            describe_agent(Some("Verse Together desktop")),
            "Verse Together desktop app"
        );
        assert_eq!(describe_agent(None), "Unknown device");
    }
    #[test]
    fn only_https_origins_or_this_computer_are_used() {
        assert_eq!(
            validate_origin("https://www.versetogether.org/").unwrap(),
            "https://www.versetogether.org"
        );
        assert_eq!(
            validate_origin("HTTP://127.0.0.1:3000").unwrap(),
            "http://127.0.0.1:3000"
        );
        assert_eq!(
            validate_origin("http://localhost:3210").unwrap(),
            "http://localhost:3210"
        );
        for bad in [
            "http://evil.example",
            "https://evil.example/path",
            "https://user@evil.example",
            "ftp://example.org",
            "https://",
            "https://exa mple.org",
            "https://example.org?x=1",
            "https://example.org:99999999",
            "www.versetogether.org",
            "javascript:alert(1)",
        ] {
            assert!(validate_origin(bad).is_err(), "{bad} should be refused");
        }
    }
    #[test]
    fn sessions_are_bound_to_their_deployment_and_profile() {
        let production = Endpoints::production();
        let preview =
            Endpoints::new("https://preview.example.org", "https://x-1.convex.cloud").unwrap();
        let a = std::env::temp_dir().join("verse-scope-a");
        let b = std::env::temp_dir().join("verse-scope-b");
        assert_ne!(
            production.credential_scope(&a),
            preview.credential_scope(&a)
        );
        assert_ne!(
            production.credential_scope(&a),
            production.credential_scope(&b)
        );
        assert_eq!(
            production.credential_scope(&a),
            production.credential_scope(&a)
        );

        let vault = Memory::default();
        let user = AccountUser {
            id: "u".into(),
            name: String::new(),
            email: String::new(),
        };
        let first = Session::for_test(user.clone(), "first-token");
        store_session(&vault, &production, &first).unwrap();
        assert_eq!(
            load_session(&vault, &production).unwrap(),
            Some(first.clone())
        );
        // The same secret read for another deployment is never used (or sent there).
        assert_eq!(load_session(&vault, &preview).unwrap(), None);
        // Forgetting an older session leaves a newer sign-in's in place.
        let second = Session::for_test(user, "second-token");
        store_session(&vault, &production, &second).unwrap();
        forget_session(&vault, &production, &first).unwrap();
        assert_eq!(
            load_session(&vault, &production).unwrap(),
            Some(second.clone())
        );
        forget_session(&vault, &production, &second).unwrap();
        assert_eq!(load_session(&vault, &production).unwrap(), None);
    }
    /// The complete native flow against a stand-in server: the "browser" follows the authorize URL's port and
    /// state to the listener, then the app exchanges the code with its verifier.
    #[test]
    fn sign_in_round_trip_against_a_local_server() {
        let server = TcpListener::bind("127.0.0.1:0").unwrap();
        let site = format!("http://{}", server.local_addr().unwrap());
        let seen = Arc::new(Mutex::new(None::<(String, String)>));
        let challenge = Arc::new(Mutex::new(String::new()));
        let server_seen = seen.clone();
        let server_challenge = challenge.clone();
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = server.accept().unwrap();
            let request = read_request(&mut stream);
            let body = request.split("\r\n\r\n").nth(1).unwrap_or("").to_string();
            let json: serde_json::Value = serde_json::from_str(&body).unwrap();
            let verifier = json["verifier"].as_str().unwrap().to_string();
            // The server's check: the verifier hashes to the challenge the browser approved.
            let ok = challenge_for(&verifier) == *server_challenge.lock().unwrap();
            *server_seen.lock().unwrap() = Some((
                request.lines().next().unwrap().to_string(),
                json["code"].as_str().unwrap().to_string(),
            ));
            let reply = if ok {
                r#"{"token":"session-token","expiresAt":"2026-11-27T00:00:00Z","user":{"id":"user-1","name":"Isaac","email":"reader@example.com"}}"#
            } else {
                r#"{"message":"bad"}"#
            };
            let status = if ok { "200 OK" } else { "401 Unauthorized" };
            write!(stream, "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{reply}", reply.len()).unwrap();
        });
        let endpoints = Endpoints::new(&site, &site).unwrap();
        let session = sign_in(&endpoints, Arc::new(AtomicBool::new(false)), |url| {
            let query = url.split_once('?').unwrap().1;
            let port: u16 = query_value(query, "port").unwrap().parse().unwrap();
            let state = query_value(query, "state").unwrap();
            *challenge.lock().unwrap() = query_value(query, "challenge").unwrap();
            assert!(url.contains("/native/authorize?"));
            std::thread::spawn(move || {
                // A stray request first: it is refused and the listener keeps waiting.
                let mut stray = TcpStream::connect(("127.0.0.1", port)).unwrap();
                write!(stray, "GET /callback?code=evil&state=wrongwrongwrongwrong HTTP/1.1\r\n\r\n").unwrap();
                let mut reply = String::new();
                let _ = stray.read_to_string(&mut reply);
                assert!(reply.starts_with("HTTP/1.1 404"));
                let mut browser = TcpStream::connect(("127.0.0.1", port)).unwrap();
                write!(browser, "GET /callback?code=one-time-code&state={state} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").unwrap();
                let mut reply = String::new();
                let _ = browser.read_to_string(&mut reply);
                assert!(reply.starts_with("HTTP/1.1 200"));
            });
            Ok(())
        })
        .unwrap();
        handle.join().unwrap();
        assert_eq!(session.user.email, "reader@example.com");
        assert_eq!(session.token(), "session-token");
        let (line, code) = seen.lock().unwrap().clone().unwrap();
        assert_eq!(line, "POST /api/auth/native/token HTTP/1.1");
        assert_eq!(code, "one-time-code");
    }
    fn read_request(stream: &mut TcpStream) -> String {
        // Read the headers, then exactly Content-Length bytes of body.
        let mut data = Vec::new();
        let mut buffer = [0u8; 4096];
        loop {
            let n = stream.read(&mut buffer).unwrap();
            data.extend_from_slice(&buffer[..n]);
            let text = String::from_utf8_lossy(&data).to_string();
            if let Some((head, body)) = text.split_once("\r\n\r\n") {
                let length: usize = head
                    .lines()
                    .find_map(|l| {
                        l.to_ascii_lowercase()
                            .strip_prefix("content-length:")
                            .map(|v| v.trim().parse().unwrap())
                    })
                    .unwrap_or(0);
                if body.len() >= length {
                    return text;
                }
            }
            assert!(n > 0, "connection closed early");
        }
    }
    #[test]
    fn a_declined_approval_stops_waiting_at_once() {
        let endpoints = Endpoints::new("http://127.0.0.1:9", "http://127.0.0.1:9").unwrap();
        let started = Instant::now();
        let result = sign_in(&endpoints, Arc::new(AtomicBool::new(false)), |url| {
            let query = url.split_once('?').unwrap().1;
            let port: u16 = query_value(query, "port").unwrap().parse().unwrap();
            let state = query_value(query, "state").unwrap();
            std::thread::spawn(move || {
                let mut browser = TcpStream::connect(("127.0.0.1", port)).unwrap();
                browser
                    .write_all(b"GET /callback?error=access_denied&state=")
                    .unwrap();
                std::thread::sleep(Duration::from_millis(30));
                write!(browser, "{state} HTTP/1.1\r\n\r\n").unwrap();
                let mut reply = String::new();
                let _ = browser.read_to_string(&mut reply);
            });
            Ok(())
        });
        assert_eq!(result.unwrap_err(), SIGN_IN_DECLINED);
        assert!(started.elapsed() < Duration::from_secs(10));
    }
    #[test]
    fn a_cancelled_sign_in_stops_waiting() {
        let endpoints = Endpoints::new("http://127.0.0.1:9", "http://127.0.0.1:9").unwrap();
        let cancel = Arc::new(AtomicBool::new(true));
        assert_eq!(
            sign_in(&endpoints, cancel, |_| Ok(())).unwrap_err(),
            SIGN_IN_CANCELLED
        );
    }
    /// Cancelled after the browser approved: the session the exchange produced is ended on the server, not kept.
    #[test]
    fn a_session_arriving_after_cancel_is_revoked() {
        let server = TcpListener::bind("127.0.0.1:0").unwrap();
        let site = format!("http://{}", server.local_addr().unwrap());
        let cancel = Arc::new(AtomicBool::new(false));
        let server_cancel = cancel.clone();
        let handle = std::thread::spawn(move || {
            let mut lines = Vec::new();
            for _ in 0..2 {
                let (mut stream, _) = server.accept().unwrap();
                let request = read_request(&mut stream);
                lines.push(request.lines().next().unwrap().to_string());
                if lines.len() == 1 {
                    // The reader pressed Cancel while the exchange was on its way.
                    server_cancel.store(true, Ordering::Relaxed);
                    let reply = r#"{"token":"late-token","user":{"id":"u","name":"","email":""}}"#;
                    write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{reply}", reply.len()).unwrap();
                } else {
                    assert!(request.contains("Bearer late-token"));
                    write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}").unwrap();
                }
            }
            lines
        });
        let endpoints = Endpoints::new(&site, &site).unwrap();
        let result = sign_in(&endpoints, cancel, |url| {
            let query = url.split_once('?').unwrap().1;
            let port: u16 = query_value(query, "port").unwrap().parse().unwrap();
            let state = query_value(query, "state").unwrap();
            std::thread::spawn(move || {
                let mut browser = TcpStream::connect(("127.0.0.1", port)).unwrap();
                write!(
                    browser,
                    "GET /callback?code=c&state={state} HTTP/1.1\r\n\r\n"
                )
                .unwrap();
                let mut reply = String::new();
                let _ = browser.read_to_string(&mut reply);
            });
            Ok(())
        });
        assert_eq!(result.unwrap_err(), SIGN_IN_CANCELLED);
        let lines = handle.join().unwrap();
        assert_eq!(lines[0], "POST /api/auth/native/token HTTP/1.1");
        assert_eq!(lines[1], "POST /api/auth/sign-out HTTP/1.1");
    }
}
