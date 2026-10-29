"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExpand, faPause, faPlay, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { clipPosterSrc, clipVideoSrc, formatClipDuration, type GuideClipId } from "./guide";
import styles from "./featureGuide.module.css";

type Status = "ready" | "playing" | "paused" | "ended" | "error";

/** Pauses every other guide clip, so only one plays at a time. */
function pauseOthers(current: HTMLVideoElement) {
  document.querySelectorAll<HTMLVideoElement>("video[data-guide-clip]").forEach((video) => {
    if (video !== current && !video.paused) video.pause();
  });
}

/**
 * One silent demo clip. Nothing plays or downloads until it is asked to (preload="none", poster only); playing one
 * pauses the others, and a clip scrolled out of view pauses. The steps beside it (describedBy) say what it shows,
 * so nothing is lost if the video can't load.
 */
export default function GuideClipPlayer({
  id,
  title,
  durationSeconds,
  width,
  height,
  describedBy,
}: {
  id: GuideClipId;
  title: string;
  durationSeconds: number;
  width: number;
  height: number;
  describedBy: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("ready");
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds);
  // Posters load as their clip nears the screen, so opening the guide doesn't fetch every one.
  const [near, setNear] = useState(false);

  // A playing clip that leaves the screen pauses.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const pauser = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && !video.paused) video.pause();
      },
      { threshold: 0.2 }
    );
    const loader = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setNear(true);
        loader.disconnect();
      },
      { rootMargin: "600px 0px" }
    );
    pauser.observe(video);
    loader.observe(video);
    return () => {
      pauser.disconnect();
      loader.disconnect();
    };
  }, []);

  function play() {
    const video = videoRef.current;
    if (!video) return;
    if (status === "error") {
      setStatus("ready");
      video.load();
    }
    if (video.ended) video.currentTime = 0;
    pauseOthers(video);
    // A rejected play() (the file failed, or the browser refused) reports through the video's error event.
    void video.play().catch(() => {});
  }

  function toggle() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) play();
    else video.pause();
  }

  function restart() {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    setTime(0);
    play();
  }

  function seek(value: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = value;
    setTime(value);
  }

  function fullScreen() {
    const frame = frameRef.current;
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (frame?.requestFullscreen) void frame.requestFullscreen().catch(() => {});
    else video?.webkitEnterFullscreen?.(); // iPhone Safari: only the video itself can fill the screen
  }

  const playing = status === "playing";
  const total = formatClipDuration(duration);
  const label = `“${title}”, ${total}, no sound`;

  return (
    <div ref={frameRef} className={styles.player} data-status={status}>
      <div className={styles.screen}>
        <video
          ref={videoRef}
          data-guide-clip={id}
          className={styles.video}
          src={clipVideoSrc(id)}
          poster={near ? clipPosterSrc(id) : undefined}
          width={width}
          height={height}
          preload="none"
          muted
          playsInline
          disablePictureInPicture
          aria-label={`Silent demo: ${title}`}
          aria-describedby={describedBy}
          onClick={toggle}
          onPlay={(event) => {
            pauseOthers(event.currentTarget);
            setStatus("playing");
          }}
          onPause={(event) => {
            // A failed load also pauses; the error stays until Try again.
            if (!event.currentTarget.ended && !event.currentTarget.error) setStatus("paused");
          }}
          onEnded={() => setStatus("ended")}
          onError={() => setStatus("error")}
          onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => {
            if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration);
          }}
        />
        {status === "error" ? (
          <div className={styles.screenNotice} role="alert">
            <p>This clip didn&apos;t load. The steps describe what it shows.</p>
            <button type="button" className={styles.noticeButton} onClick={play}>
              Try again
            </button>
          </div>
        ) : !playing ? (
          // A large target for pointers and touch; keyboards and screen readers use the same control in the bar below.
          <button type="button" className={styles.bigPlay} onClick={status === "ended" ? restart : play} tabIndex={-1} aria-hidden="true">
            <span className={styles.bigPlayIcon}>
              <FontAwesomeIcon icon={status === "ended" ? faRotateLeft : faPlay} />
            </span>
            <span className={styles.bigPlayLabel}>
              {status === "ended" ? "Replay" : status === "paused" ? "Resume" : "Play"} · {total}
            </span>
          </button>
        ) : null}
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.control}
          onClick={status === "ended" ? restart : toggle}
          aria-label={`${playing ? "Pause" : status === "ended" ? "Replay" : "Play"} ${label}`}
          disabled={status === "error"}
        >
          <FontAwesomeIcon icon={playing ? faPause : status === "ended" ? faRotateLeft : faPlay} aria-hidden="true" />
        </button>
        <button type="button" className={styles.control} onClick={restart} aria-label={`Restart ${label}`} disabled={status === "error"}>
          <FontAwesomeIcon icon={faRotateLeft} aria-hidden="true" />
        </button>
        <input
          type="range"
          className={styles.progress}
          min={0}
          max={duration}
          step={0.1}
          value={Math.min(time, duration)}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label={`Position in “${title}”`}
          aria-valuetext={`${formatClipDuration(time)} of ${total}`}
          disabled={status === "error"}
          style={{ ["--progress" as string]: `${(Math.min(time, duration) / duration) * 100}%` }}
        />
        <span className={styles.time} aria-hidden="true">
          {formatClipDuration(time)} / {total}
        </span>
        <span className={styles.silent}>No sound</span>
        <button type="button" className={styles.control} onClick={fullScreen} aria-label={`Full screen: ${title}`} disabled={status === "error"}>
          <FontAwesomeIcon icon={faExpand} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
