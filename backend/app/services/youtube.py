from __future__ import annotations

import httpx
from typing import List
from app.core.config import Settings

YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"


async def search_youtube(settings: Settings, query: str, max_results: int = 6) -> List[dict]:
    """Search YouTube videos using the Data API v3 via backend proxy.

    Returns a list of dicts: {id, title, channel, publishedAt, thumbnail}
    """
    api_key = settings.youtube_api_key
    if not api_key:
        raise RuntimeError("YouTube API key not configured on the server.")

    params = {
        "part": "snippet",
        "q": query,
        "type": "video",
        "maxResults": str(max_results),
        "key": api_key,
    }

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(YOUTUBE_SEARCH_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    items = []
    for it in data.get("items", []):
        vid = it.get("id", {}).get("videoId")
        snip = it.get("snippet", {})
        if not vid:
            continue
        thumbnails = snip.get("thumbnails", {})
        thumb = thumbnails.get("medium") or thumbnails.get("default") or {}
        items.append(
            {
                "id": vid,
                "title": snip.get("title"),
                "channelTitle": snip.get("channelTitle"),
                "publishedAt": snip.get("publishedAt"),
                "thumbnail": thumb.get("url"),
            }
        )

    return items
