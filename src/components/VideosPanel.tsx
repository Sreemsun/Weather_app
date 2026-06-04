import React from 'react';

type Video = {
  id: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail?: string;
};

export default function VideosPanel({ videos, onClose }: { videos: Video[]; onClose: () => void }) {
  return (
    <div className="videos-panel">
      <div className="videos-header">
        <h3>YouTube Videos</h3>
        <button className="location-button secondary" onClick={onClose}>Close</button>
      </div>

      <div className="videos-list">
        {videos.map((v) => (
          <article key={v.id} className="video-row">
            <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer">
              <img src={v.thumbnail} alt={v.title} className="video-thumb" />
            </a>
            <div className="video-copy">
              <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer"><strong>{v.title}</strong></a>
              <div className="video-meta">{v.channelTitle} · {new Date(v.publishedAt).toLocaleDateString()}</div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
