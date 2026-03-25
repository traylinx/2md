import { useEffect, useRef } from 'preact/hooks';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

export const VideoJS = (props) => {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const { options, onReady, audioOnly = false } = props;

  useEffect(() => {
    if (playerRef.current) return;

    const videoElement = document.createElement('video-js');
    videoElement.classList.add('vjs-big-play-centered');

    if (options.fluid) {
      videoElement.classList.add('vjs-fluid');
    }

    videoRef.current.appendChild(videoElement);

    const mergedOptions = { 
      ...options,
      controlBar: {
        ...(options.controlBar || {}),
        children: [
          'playToggle',
          'currentTimeDisplay',
          'timeDivider',
          'durationDisplay',
          'progressControl',
          'customControlSpacer',
          'volumePanel',
          options.controlBar?.fullscreenToggle === false ? null : 'fullscreenToggle'
        ].filter(Boolean)
      }
    };

    if (audioOnly) {
      mergedOptions.audioOnlyMode = true;
      mergedOptions.audioPosterMode = false;
    }

    const player = playerRef.current = videojs(videoElement, mergedOptions, () => {
      videojs.log('player is ready');
      if (onReady) {
        onReady(player);
      }
    });

    return () => {};
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    return () => {
      if (player && !player.isDisposed()) {
        player.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  return (
    <div data-vjs-player style={{ width: '100%', height: audioOnly ? 'auto' : 'auto', borderRadius: 'inherit' }}>
      <div ref={videoRef} style={{ width: '100%', height: audioOnly ? 'auto' : 'auto', borderRadius: 'inherit' }} />
    </div>
  );
};

export default VideoJS;
