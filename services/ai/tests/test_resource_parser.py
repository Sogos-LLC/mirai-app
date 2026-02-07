"""Tests for URLResourceParser — URL extraction and media type classification."""

import pytest

from src.models.resource_hint import ResourceHint
from src.services.resource_parser import URLResourceParser


@pytest.fixture
def parser() -> URLResourceParser:
    return URLResourceParser()


# -------------------------------------------------------------------------
# Video providers
# -------------------------------------------------------------------------


class TestVideoProviders:
    def test_youtube_watch_url(self, parser: URLResourceParser) -> None:
        text = "Check out this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        hints = parser.parse(text)
        assert len(hints) == 1
        assert hints[0].media_type == "video"
        assert hints[0].provider == "youtube"
        assert hints[0].url == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

    def test_youtube_short_url(self, parser: URLResourceParser) -> None:
        hints = parser.parse("Watch: https://youtu.be/dQw4w9WgXcQ")
        assert len(hints) == 1
        assert hints[0].media_type == "video"
        assert hints[0].provider == "youtube"

    def test_youtube_embed_url(self, parser: URLResourceParser) -> None:
        hints = parser.parse("https://www.youtube.com/embed/dQw4w9WgXcQ")
        assert len(hints) == 1
        assert hints[0].media_type == "video"
        assert hints[0].provider == "youtube"

    def test_vimeo_url(self, parser: URLResourceParser) -> None:
        hints = parser.parse("See https://vimeo.com/123456789 for demo")
        assert len(hints) == 1
        assert hints[0].media_type == "video"
        assert hints[0].provider == "vimeo"

    def test_loom_url(self, parser: URLResourceParser) -> None:
        hints = parser.parse("https://www.loom.com/share/abc123def456")
        assert len(hints) == 1
        assert hints[0].media_type == "video"
        assert hints[0].provider == "loom"

    def test_direct_video_mp4(self, parser: URLResourceParser) -> None:
        hints = parser.parse("Download from https://example.com/lecture.mp4")
        assert len(hints) == 1
        assert hints[0].media_type == "video"
        assert hints[0].provider is None

    def test_direct_video_webm(self, parser: URLResourceParser) -> None:
        hints = parser.parse("https://cdn.example.com/intro.webm")
        assert len(hints) == 1
        assert hints[0].media_type == "video"


# -------------------------------------------------------------------------
# Audio providers
# -------------------------------------------------------------------------


class TestAudioProviders:
    def test_soundcloud_url(self, parser: URLResourceParser) -> None:
        hints = parser.parse("Listen: https://soundcloud.com/user/track-name")
        assert len(hints) == 1
        assert hints[0].media_type == "audio"
        assert hints[0].provider == "soundcloud"

    def test_spotify_url(self, parser: URLResourceParser) -> None:
        hints = parser.parse("https://open.spotify.com/episode/abc123")
        assert len(hints) == 1
        assert hints[0].media_type == "audio"
        assert hints[0].provider == "spotify"

    def test_notebooklm_url(self, parser: URLResourceParser) -> None:
        hints = parser.parse("https://notebooklm.google.com/notebook/abc")
        assert len(hints) == 1
        assert hints[0].media_type == "audio"
        assert hints[0].provider == "notebooklm"

    def test_apple_podcasts_url(self, parser: URLResourceParser) -> None:
        hints = parser.parse("https://podcasts.apple.com/us/podcast/example/id123")
        assert len(hints) == 1
        assert hints[0].media_type == "audio"
        assert hints[0].provider == "apple_podcasts"

    def test_direct_audio_mp3(self, parser: URLResourceParser) -> None:
        hints = parser.parse("https://example.com/episode.mp3")
        assert len(hints) == 1
        assert hints[0].media_type == "audio"
        assert hints[0].provider is None

    def test_direct_audio_wav(self, parser: URLResourceParser) -> None:
        hints = parser.parse("https://example.com/sample.wav")
        assert len(hints) == 1
        assert hints[0].media_type == "audio"

    def test_direct_audio_ogg(self, parser: URLResourceParser) -> None:
        hints = parser.parse("https://example.com/narration.ogg")
        assert len(hints) == 1
        assert hints[0].media_type == "audio"


# -------------------------------------------------------------------------
# Interactive providers
# -------------------------------------------------------------------------


class TestInteractiveProviders:
    def test_codepen_url(self, parser: URLResourceParser) -> None:
        hints = parser.parse("https://codepen.io/user/pen/abcdef")
        assert len(hints) == 1
        assert hints[0].media_type == "interactive"
        assert hints[0].provider == "codepen"

    def test_codesandbox_url(self, parser: URLResourceParser) -> None:
        hints = parser.parse("https://codesandbox.io/s/example-abc123")
        assert len(hints) == 1
        assert hints[0].media_type == "interactive"
        assert hints[0].provider == "codesandbox"

    def test_figma_url(self, parser: URLResourceParser) -> None:
        hints = parser.parse("https://www.figma.com/file/abc123/design")
        assert len(hints) == 1
        assert hints[0].media_type == "interactive"
        assert hints[0].provider == "figma"

    def test_stackblitz_url(self, parser: URLResourceParser) -> None:
        hints = parser.parse("https://stackblitz.com/edit/project-abc")
        assert len(hints) == 1
        assert hints[0].media_type == "interactive"
        assert hints[0].provider == "stackblitz"


# -------------------------------------------------------------------------
# Edge cases
# -------------------------------------------------------------------------


class TestEdgeCases:
    def test_empty_string(self, parser: URLResourceParser) -> None:
        assert parser.parse("") == []

    def test_no_urls(self, parser: URLResourceParser) -> None:
        assert parser.parse("This text has no URLs at all.") == []

    def test_general_url_classified_as_reference(self, parser: URLResourceParser) -> None:
        text = "Read the docs at https://docs.python.org/3/tutorial/"
        hints = parser.parse(text)
        assert len(hints) == 1
        assert hints[0].media_type == "reference"
        assert hints[0].provider is None

    def test_article_url_as_reference(self, parser: URLResourceParser) -> None:
        text = "See https://react.dev/learn/thinking-in-react for details"
        hints = parser.parse(text)
        assert len(hints) == 1
        assert hints[0].media_type == "reference"

    def test_multiple_urls(self, parser: URLResourceParser) -> None:
        text = (
            "Watch https://www.youtube.com/watch?v=abc123 and listen to "
            "https://soundcloud.com/user/track then try "
            "https://codepen.io/user/pen/xyz"
        )
        hints = parser.parse(text)
        assert len(hints) == 3
        types = [h.media_type for h in hints]
        assert types == ["video", "audio", "interactive"]

    def test_deduplication(self, parser: URLResourceParser) -> None:
        text = (
            "Watch https://www.youtube.com/watch?v=abc123 "
            "and again https://www.youtube.com/watch?v=abc123"
        )
        hints = parser.parse(text)
        assert len(hints) == 1

    def test_trailing_punctuation_stripped(self, parser: URLResourceParser) -> None:
        text = "Check out https://www.youtube.com/watch?v=abc123."
        hints = parser.parse(text)
        assert len(hints) == 1
        assert not hints[0].url.endswith(".")

    def test_mixed_reference_and_media(self, parser: URLResourceParser) -> None:
        text = (
            "Read https://docs.example.com/guide and watch "
            "https://www.youtube.com/watch?v=abc123"
        )
        hints = parser.parse(text)
        assert len(hints) == 2
        assert hints[0].media_type == "reference"
        assert hints[1].media_type == "video"
        assert hints[1].provider == "youtube"

    def test_url_with_query_params_and_extension(self, parser: URLResourceParser) -> None:
        hints = parser.parse("https://cdn.example.com/video.mp4?token=abc123")
        assert len(hints) == 1
        assert hints[0].media_type == "video"


# -------------------------------------------------------------------------
# MultimediaComponent serialization
# -------------------------------------------------------------------------


class TestMultimediaComponentSerialization:
    def test_multimedia_in_proto_component_union(self) -> None:
        """MultimediaComponent is included in the ProtoComponent union."""
        from src.models.component_content import MultimediaComponent, COMPONENT_TYPE_MAP

        comp = MultimediaComponent(
            mediaType="video",
            url="https://www.youtube.com/watch?v=abc123",
            title="Intro Video",
            description="Course introduction",
            provider="youtube",
        )
        assert comp.type == "multimedia"
        assert comp.mediaType == "video"
        assert COMPONENT_TYPE_MAP["multimedia"] == 11

    def test_multimedia_model_dump_for_s3(self) -> None:
        """After model_dump(exclude={'type'}) + mediaType→type rename,
        the contentJson matches proto MultimediaContent schema."""
        from src.models.component_content import MultimediaComponent

        comp = MultimediaComponent(
            mediaType="video",
            url="https://www.youtube.com/watch?v=abc123",
            title="Intro Video",
            description="Course introduction",
            provider="youtube",
        )
        content_data = comp.model_dump(exclude={"type"})
        # Simulate the rename done in course_creation.py
        content_data["type"] = content_data.pop("mediaType")

        assert content_data == {
            "type": "video",
            "url": "https://www.youtube.com/watch?v=abc123",
            "title": "Intro Video",
            "description": "Course introduction",
            "provider": "youtube",
            "isPlaceholder": None,
        }

    def test_multimedia_discriminator(self) -> None:
        """MultimediaComponent can be deserialized through the ProtoComponent union."""
        from src.models.component_content import LessonComponents

        data = {
            "components": [
                {
                    "type": "multimedia",
                    "mediaType": "audio",
                    "url": "https://soundcloud.com/user/track",
                    "title": "Podcast Episode",
                },
                {
                    "type": "text",
                    "textHtml": "<p>Some text content.</p>",
                },
                {
                    "type": "quiz",
                    "quizQuestion": "What is 1+1?",
                    "quizOptions": [
                        {"id": "a", "text": "1"},
                        {"id": "b", "text": "2"},
                        {"id": "c", "text": "3"},
                    ],
                    "quizCorrectAnswerId": "b",
                    "quizExplanation": "Basic math.",
                },
            ],
            "outcomes_covered": ["understand addition"],
        }
        lc = LessonComponents(**data)
        assert len(lc.components) == 3
        assert lc.components[0].type == "multimedia"
        assert lc.components[0].mediaType == "audio"
