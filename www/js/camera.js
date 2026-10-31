// Shared camera helpers.

export async function openCamera(video, facing = 'environment') {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This device has no camera access');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();
  return stream;
}

export function closeCamera(video) {
  const s = video?.srcObject;
  if (s) s.getTracks().forEach((t) => t.stop());
  if (video) video.srcObject = null;
}

const loaded = new Map();
export function loadScript(src) {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.appendChild(s);
    }));
  }
  return loaded.get(src);
}

// Where the video's pixels land inside its element with object-fit: contain.
export function containRect(video) {
  const ew = video.clientWidth;
  const eh = video.clientHeight;
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const s = Math.min(ew / vw, eh / vh);
  return { x: (ew - vw * s) / 2, y: (eh - vh * s) / 2, s };
}
