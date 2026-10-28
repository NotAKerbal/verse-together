use std::{
    fs::File,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::Path,
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};

pub const ORIGIN: &str = "http://127.0.0.1:47831";
const ADDRESS: &str = "127.0.0.1:47831";

// Own the process immediately, including on startup failure and early returns.
pub struct LocalServer(Child);
impl Drop for LocalServer {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

pub fn start(resources: &Path, log_dir: &Path) -> Result<LocalServer, Box<dyn std::error::Error>> {
    // A fixed loopback origin preserves cookies/storage between launches. Fail closed if busy.
    let reservation = TcpListener::bind(ADDRESS)
        .map_err(|e| format!("Verse Together's local port 47831 is unavailable: {e}"))?;
    let server_dir = resources.join("server");
    let node = resources.join("runtime").join(if cfg!(windows) { "node.exe" } else { "node" });
    std::fs::create_dir_all(log_dir)?;
    let log = File::create(log_dir.join("desktop-server.log"))?;
    let mut command = Command::new(node);
    command.arg(server_dir.join("server.js")).current_dir(&server_dir)
        .env_clear()
        .env("NODE_ENV", "production")
        .env("HOSTNAME", "127.0.0.1")
        .env("PORT", "47831")
        .env("NEXT_TELEMETRY_DISABLED", "1")
        .stdin(Stdio::null()).stdout(log.try_clone()?).stderr(log);
    // Required OS paths only; do not inherit API keys or Node injection flags.
    for key in ["PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR", "LOCALAPPDATA"] {
        if let Some(value) = std::env::var_os(key) { command.env(key, value); }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    drop(reservation);
    let mut server = LocalServer(command.spawn()?);
    let deadline = Instant::now() + Duration::from_secs(30);
    while Instant::now() < deadline {
        if let Some(status) = server.0.try_wait()? {
            return Err(format!("Local app server exited ({status}); see desktop-server.log").into());
        }
        if ready() { return Ok(server); }
        thread::sleep(Duration::from_millis(100));
    }
    Err("Local app server did not become ready in 30 seconds; see desktop-server.log".into())
}

fn ready() -> bool {
    let Ok(mut stream) = TcpStream::connect_timeout(&ADDRESS.parse().unwrap(), Duration::from_millis(200)) else { return false; };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(200)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(200)));
    if stream.write_all(b"GET /desktop-ready.txt HTTP/1.0\r\nHost: 127.0.0.1:47831\r\n\r\n").is_err() { return false; }
    let mut response = String::new();
    stream.take(8192).read_to_string(&mut response).is_ok()
        && response.starts_with("HTTP/1.1 200")
        && response.contains("verse-together-desktop-ready-v1")
}
