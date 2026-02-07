"""URL-based resource parser for detecting multimedia resources in user text.

Extracts URLs from free-form text and classifies them by media type and provider.
Used during course creation to detect multimedia resources in the "Additional Context" field.
"""

from __future__ import annotations

import re

from src.models.resource_hint import ResourceHint


# Generic URL extraction pattern
_URL_RE = re.compile(
    r"https?://[^\s<>\"\')}\]]+",
    re.IGNORECASE,
)

# Provider classification rules: (pattern, media_type, provider)
_PROVIDER_RULES: list[tuple[re.Pattern[str], str, str]] = [
    # Video providers
    (re.compile(r"(?:youtube\.com/watch|youtube\.com/embed|youtu\.be/)", re.I), "video", "youtube"),
    (re.compile(r"vimeo\.com/\d+", re.I), "video", "vimeo"),
    (re.compile(r"dailymotion\.com/video/", re.I), "video", "dailymotion"),
    (re.compile(r"loom\.com/share/", re.I), "video", "loom"),
    # Audio providers
    (re.compile(r"soundcloud\.com/", re.I), "audio", "soundcloud"),
    (re.compile(r"open\.spotify\.com/", re.I), "audio", "spotify"),
    (re.compile(r"notebooklm\.google\.com/", re.I), "audio", "notebooklm"),
    (re.compile(r"podcasts\.apple\.com/", re.I), "audio", "apple_podcasts"),
    # Interactive providers
    (re.compile(r"codepen\.io/", re.I), "interactive", "codepen"),
    (re.compile(r"codesandbox\.io/", re.I), "interactive", "codesandbox"),
    (re.compile(r"figma\.com/", re.I), "interactive", "figma"),
    (re.compile(r"stackblitz\.com/", re.I), "interactive", "stackblitz"),
]

# File extension classification
_VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi", ".mkv"}
_AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"}


class URLResourceParser:
    """Extracts and classifies media URLs from free-form text."""

    def parse(self, text: str) -> list[ResourceHint]:
        """Extract all media URLs from text and classify them.

        Returns de-duplicated list of ResourceHints sorted by position in text.
        Non-media URLs (e.g. documentation links) are excluded.
        """
        urls = _URL_RE.findall(text)
        seen: set[str] = set()
        hints: list[ResourceHint] = []

        for url in urls:
            # Strip trailing punctuation that got captured
            url = url.rstrip(".,;:!?")

            if url in seen:
                continue
            seen.add(url)
            hints.append(self._classify(url))

        return hints

    def _classify(self, url: str) -> ResourceHint:
        """Classify a URL by media type and provider.

        Known media providers → video/audio/interactive.
        Everything else → reference (articles, docs, blog posts, etc.).
        """
        # Check known providers first
        for pattern, media_type, provider in _PROVIDER_RULES:
            if pattern.search(url):
                return ResourceHint(url=url, media_type=media_type, provider=provider)

        # Check file extensions
        # Extract path without query params for extension check
        path = url.split("?")[0].split("#")[0].lower()

        for ext in _VIDEO_EXTENSIONS:
            if path.endswith(ext):
                return ResourceHint(url=url, media_type="video")

        for ext in _AUDIO_EXTENSIONS:
            if path.endswith(ext):
                return ResourceHint(url=url, media_type="audio")

        # General URL — treat as a reference link
        return ResourceHint(url=url, media_type="reference")
