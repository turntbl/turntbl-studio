// js/editor.js

import { supabase, UPLOAD_FUNCTION_URL } from './config.js';

// State management
const editorState = {
  videoFile: null,
  audioFile: null,
  coverFile: null,
  videoElement: null,
  audioElement: null,
  trimStart: 0,
  trimEnd: 30,
  textOverlays: [],
  metadata: {
    title: '',
    album: '',
    genre: ''
  }
};

// Auth check
const token = sessionStorage.getItem('turntbl_token');
const artistId = sessionStorage.getItem('turntbl_artist_id');
const returnUrl = sessionStorage.getItem('turntbl_return_url');

if (!token || !artistId) {
  window.location.href = '/';
}

// Section navigation
function showSection(sectionId) {
  document.querySelectorAll('.editor-section').forEach(section => {
    section.classList.remove('active');
  });
  document.getElementById(sectionId).classList.add('active');
}

// ============================================
// STEP 1: FILE UPLOADS
// ============================================

// Video upload
document.getElementById('video-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Validate video
  if (!file.type.startsWith('video/')) {
    alert('Please upload a video file');
    return;
  }

  editorState.videoFile = file;
  
  // Show preview
  const videoElement = document.getElementById('video-element');
  videoElement.src = URL.createObjectURL(file);
  document.getElementById('video-preview').style.display = 'block';
  document.getElementById('video-filename').textContent = file.name;

  // Store video element
  editorState.videoElement = videoElement;

  // Update trim end based on video duration
  videoElement.addEventListener('loadedmetadata', () => {
    const duration = videoElement.duration;
    editorState.trimEnd = Math.min(duration, 30);
    document.getElementById('trim-end').value = editorState.trimEnd.toFixed(1);
    document.getElementById('trim-end').max = duration.toFixed(1);
  });

  checkAllFilesUploaded();
});

// Audio upload
document.getElementById('audio-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('audio/')) {
    alert('Please upload an audio file');
    return;
  }

  editorState.audioFile = file;
  
  const audioElement = document.getElementById('audio-element');
  audioElement.src = URL.createObjectURL(file);
  document.getElementById('audio-preview').style.display = 'block';
  document.getElementById('audio-filename').textContent = file.name;

  editorState.audioElement = audioElement;

  checkAllFilesUploaded();
});

// Cover art upload
document.getElementById('cover-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('Please upload an image file');
    return;
  }

  editorState.coverFile = file;
  
  const coverElement = document.getElementById('cover-element');
  coverElement.src = URL.createObjectURL(file);
  document.getElementById('cover-preview').style.display = 'block';
  document.getElementById('cover-filename').textContent = file.name;

  checkAllFilesUploaded();
});

function checkAllFilesUploaded() {
  const allUploaded = editorState.videoFile && editorState.audioFile && editorState.coverFile;
  document.getElementById('continue-metadata-btn').disabled = !allUploaded;
}

// Continue to metadata
document.getElementById('continue-metadata-btn').addEventListener('click', () => {
  showSection('metadata-section');
});

// ============================================
// STEP 2: METADATA
// ============================================

document.getElementById('back-to-upload-btn').addEventListener('click', () => {
  showSection('upload-section');
});

document.getElementById('continue-edit-btn').addEventListener('click', () => {
  const title = document.getElementById('song-title').value.trim();
  
  if (!title) {
    alert('Please enter a song title');
    return;
  }

  editorState.metadata = {
    title: title,
    album: document.getElementById('album').value.trim(),
    genre: document.getElementById('genre').value
  };

  initializeEditor();
  showSection('edit-section');
});

// ============================================
// STEP 3: VIDEO EDITOR
// ============================================

function initializeEditor() {
  const canvas = document.getElementById('preview-canvas');
  const ctx = canvas.getContext('2d');
  const video = editorState.videoElement;

  // Set canvas size to match video
  video.addEventListener('loadedmetadata', () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Scale canvas for display
    const containerWidth = canvas.parentElement.offsetWidth;
    canvas.style.width = containerWidth + 'px';
    canvas.style.height = (containerWidth * (video.videoHeight / video.videoWidth)) + 'px';
  });

  // Draw video frames to canvas
  function drawFrame() {
    if (!video.paused && !video.ended) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      requestAnimationFrame(drawFrame);
    }
  }

  video.addEventListener('play', drawFrame);

  // Update time display
  video.addEventListener('timeupdate', () => {
    const current = video.currentTime;
    const duration = video.duration;
    document.getElementById('current-time').textContent = formatTime(current);
    document.getElementById('total-time').textContent = formatTime(duration);
    document.getElementById('video-scrubber').value = (current / duration) * 100;
  });
}

// Play/pause control
document.getElementById('play-pause-btn').addEventListener('click', () => {
  const video = editorState.videoElement;
  const btn = document.getElementById('play-pause-btn');
  
  if (video.paused) {
    video.play();
    btn.textContent = '⏸️ Pause';
  } else {
    video.pause();
    btn.textContent = '▶️ Play';
  }
});

// Video scrubber
document.getElementById('video-scrubber').addEventListener('input', (e) => {
  const video = editorState.videoElement;
  const percent = e.target.value / 100;
  video.currentTime = video.duration * percent;
});

// Trim controls
document.getElementById('apply-trim-btn').addEventListener('click', () => {
  const start = parseFloat(document.getElementById('trim-start').value);
  const end = parseFloat(document.getElementById('trim-end').value);
  const video = editorState.videoElement;

  if (start < 0 || end > video.duration || start >= end) {
    alert('Invalid trim values');
    return;
  }

  if (end - start > 30) {
    alert('Video must be 30 seconds or less');
    return;
  }

  editorState.trimStart = start;
  editorState.trimEnd = end;
  
  // Jump to start of trimmed section
  video.currentTime = start;
  
  alert(`Video trimmed to ${(end - start).toFixed(1)} seconds`);
});

// Text overlay
document.getElementById('add-text-btn').addEventListener('click', () => {
  const text = document.getElementById('text-input').value.trim();
  if (!text) return;

  const textOverlay = {
    id: Date.now(),
    text: text,
    color: document.getElementById('text-color').value,
    font: document.getElementById('text-font').value,
    size: parseInt(document.getElementById('text-size').value),
    x: 50, // Center
    y: 50  // Center
  };

  editorState.textOverlays.push(textOverlay);
  renderTextOverlay(textOverlay);
  updateTextList();
  
  // Clear input
  document.getElementById('text-input').value = '';
});

function renderTextOverlay(overlay) {
  const container = document.getElementById('text-overlay-container');
  
  const textElement = document.createElement('div');
  textElement.className = 'text-overlay-item';
  textElement.id = `text-${overlay.id}`;
  textElement.style.cssText = `
    position: absolute;
    left: ${overlay.x}%;
    top: ${overlay.y}%;
    transform: translate(-50%, -50%);
    color: ${overlay.color};
    font-family: ${overlay.font};
    font-size: ${overlay.size}px;
    font-weight: bold;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    cursor: move;
    user-select: none;
    white-space: nowrap;
  `;
  textElement.textContent = overlay.text;
  
  // Make draggable (simple version)
  let isDragging = false;
  let startX, startY;
  
  textElement.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    const containerRect = container.getBoundingClientRect();
    overlay.x += (deltaX / containerRect.width) * 100;
    overlay.y += (deltaY / containerRect.height) * 100;
    
    // Clamp to bounds
    overlay.x = Math.max(5, Math.min(95, overlay.x));
    overlay.y = Math.max(5, Math.min(95, overlay.y));
    
    textElement.style.left = overlay.x + '%';
    textElement.style.top = overlay.y + '%';
    
    startX = e.clientX;
    startY = e.clientY;
  });
  
  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
  
  container.appendChild(textElement);
}

function updateTextList() {
  const list = document.getElementById('text-list');
  list.innerHTML = '';
  
  editorState.textOverlays.forEach(overlay => {
    const item = document.createElement('div');
    item.className = 'text-list-item';
    item.innerHTML = `
      <span>"${overlay.text}"</span>
      <button onclick="window.removeTextOverlay(${overlay.id})">Remove</button>
    `;
    list.appendChild(item);
  });
}

window.removeTextOverlay = function(id) {
  editorState.textOverlays = editorState.textOverlays.filter(o => o.id !== id);
  document.getElementById(`text-${id}`)?.remove();
  updateTextList();
};

// Back button
document.getElementById('back-to-metadata-btn').addEventListener('click', () => {
  showSection('metadata-section');
});

// ============================================
// STEP 4: PUBLISH
// ============================================

document.getElementById('publish-btn').addEventListener('click', async () => {
  if (!confirm('Ready to publish this song to Turntbl?')) return;

  // Show publishing section
  showSection('publishing-section');
  document.getElementById('publish-status').textContent = 'Preparing files...';

  try {
    // 1. Create trimmed video (if needed)
    let finalVideo = editorState.videoFile;
    if (editorState.trimStart > 0 || editorState.trimEnd < editorState.videoElement.duration) {
      document.getElementById('publish-status').textContent = 'Trimming video...';
      finalVideo = await trimVideo();
    }

    // 2. Burn text overlays into video (if any)
    if (editorState.textOverlays.length > 0) {
      document.getElementById('publish-status').textContent = 'Adding text to video...';
      finalVideo = await burnTextIntoVideo(finalVideo);
    }

    // 3. Prepare form data
    document.getElementById('publish-status').textContent = 'Uploading to Turntbl...';
    
    const formData = new FormData();
    formData.append('video', finalVideo);
    formData.append('audio', editorState.audioFile);
    formData.append('cover_art', editorState.coverFile);
    formData.append('title', editorState.metadata.title);
    formData.append('album', editorState.metadata.album);
    formData.append('genre', editorState.metadata.genre);
    formData.append('artist_id', artistId);
    formData.append('duration', editorState.audioElement.duration.toString());

    // 4. Upload to Supabase Function
    const response = await fetch(UPLOAD_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    const result = await response.json();

    // 5. Success! Redirect back to Turntbl
    document.getElementById('publish-status').textContent = 'Success! Redirecting...';
    setTimeout(() => {
      window.location.href = `${returnUrl}?song_id=${result.song_id}&success=true`;
    }, 1500);

  } catch (error) {
    console.error('Publish error:', error);
    alert(`Failed to publish: ${error.message}`);
    showSection('edit-section');
  }
});

// Helper: Trim video
async function trimVideo() {
  // For MVP, we'll just use the original video
  // In Phase 2, implement actual trimming with FFmpeg.wasm
  // For now, we'll handle trim on playback (seek to start, stop at end)
  
  // TODO: Implement actual video trimming
  return editorState.videoFile;
}

// Helper: Burn text into video
async function burnTextIntoVideo(videoFile) {
  // For MVP, text overlays render client-side during playback
  // In Phase 2, implement actual text burning with Canvas → MediaRecorder
  
  // TODO: Implement text burning
  return videoFile;
}

// Helper: Format time
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Cancel button
document.getElementById('cancel-btn').addEventListener('click', () => {
  if (confirm('Are you sure? All changes will be lost.')) {
    window.location.href = returnUrl;
  }
});
