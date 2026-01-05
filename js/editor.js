// js/editor.js

import { supabase, UPLOAD_FUNCTION_URL } from './config.js';

// State management
const editorState = {
  videoFile: null,
  videoBlob: null,
  audioFile: null,
  selectedSongId: null,
  videoElement: null,
  audioElement: null,
  trimStart: 0,
  trimEnd: 30,
  textOverlays: [],
  recordingStream: null,
  mediaRecorder: null,
  recordedChunks: [],
  recordingStartTime: null,
  facingMode: 'user', // 'user' = front camera, 'environment' = back camera
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
// STEP 1: RECORD OR UPLOAD VIDEO
// ============================================

// Start Recording
document.getElementById('start-recording-btn').addEventListener('click', async () => {
  document.getElementById('video-source-options').style.display = 'none';
  document.getElementById('recording-interface').style.display = 'block';
  await startCamera();
});

// Back to options
document.getElementById('back-to-options-btn').addEventListener('click', () => {
  stopCamera();
  document.getElementById('recording-interface').style.display = 'none';
  document.getElementById('video-source-options').style.display = 'grid';
});

// Start camera
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: editorState.facingMode },
      audio: true
    });
    
    editorState.recordingStream = stream;
    const preview = document.getElementById('camera-preview');
    preview.srcObject = stream;
    
    console.log('✅ Camera started');
  } catch (error) {
    console.error('Camera error:', error);
    alert('Could not access camera: ' + error.message);
    document.getElementById('back-to-options-btn').click();
  }
}

// Stop camera
function stopCamera() {
  if (editorState.recordingStream) {
    editorState.recordingStream.getTracks().forEach(track => track.stop());
    editorState.recordingStream = null;
  }
}

// Flip camera
document.getElementById('flip-camera-btn').addEventListener('click', async () => {
  editorState.facingMode = editorState.facingMode === 'user' ? 'environment' : 'user';
  stopCamera();
  await startCamera();
});

// Start/Stop recording
document.getElementById('record-btn').addEventListener('click', () => {
  if (!editorState.mediaRecorder || editorState.mediaRecorder.state === 'inactive') {
    startRecording();
  }
});

document.getElementById('stop-recording-btn').addEventListener('click', () => {
  stopRecording();
});

function startRecording() {
  editorState.recordedChunks = [];
  
  const options = { mimeType: 'video/webm;codecs=vp8,opus' };
  
  try {
    editorState.mediaRecorder = new MediaRecorder(editorState.recordingStream, options);
  } catch (e) {
    console.error('MediaRecorder error:', e);
    alert('Recording not supported on this device');
    return;
  }
  
  editorState.mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      editorState.recordedChunks.push(event.data);
    }
  };
  
  editorState.mediaRecorder.onstop = () => {
    const blob = new Blob(editorState.recordedChunks, { type: 'video/webm' });
    handleRecordedVideo(blob);
  };
  
  editorState.mediaRecorder.start();
  editorState.recordingStartTime = Date.now();
  
  // Show recording UI
  document.getElementById('record-btn').style.display = 'none';
  document.getElementById('stop-recording-btn').style.display = 'block';
  document.getElementById('recording-timer').style.display = 'block';
  document.getElementById('flip-camera-btn').disabled = true;
  
  // Start timer
  const timerInterval = setInterval(() => {
    if (!editorState.mediaRecorder || editorState.mediaRecorder.state !== 'recording') {
      clearInterval(timerInterval);
      return;
    }
    
    const elapsed = (Date.now() - editorState.recordingStartTime) / 1000;
    document.getElementById('recording-timer').textContent = formatTime(elapsed);
    
    // Auto-stop at 30 seconds
    if (elapsed >= 30) {
      stopRecording();
      clearInterval(timerInterval);
    }
  }, 100);
  
  console.log('🔴 Recording started');
}

function stopRecording() {
  if (editorState.mediaRecorder && editorState.mediaRecorder.state === 'recording') {
    editorState.mediaRecorder.stop();
    stopCamera();
    
    // Reset UI
    document.getElementById('record-btn').style.display = 'block';
    document.getElementById('stop-recording-btn').style.display = 'none';
    document.getElementById('recording-timer').style.display = 'none';
    document.getElementById('flip-camera-btn').disabled = false;
    
    console.log('⏹️ Recording stopped');
  }
}

function handleRecordedVideo(blob) {
  editorState.videoBlob = blob;
  editorState.videoFile = new File([blob], 'recorded-video.webm', { type: 'video/webm' });
  
  // Show preview
  showVideoPreview(URL.createObjectURL(blob), 'Recorded video');
}

// Upload video
document.getElementById('video-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('video/')) {
    alert('Please upload a video file');
    return;
  }
  
  editorState.videoFile = file;
  showVideoPreview(URL.createObjectURL(file), file.name);
});

function showVideoPreview(url, filename) {
  const videoElement = document.getElementById('preview-video');
  videoElement.src = url;
  document.getElementById('video-filename').textContent = filename;
  
  // Hide source options, show preview
  document.getElementById('video-source-options').style.display = 'none';
  document.getElementById('recording-interface').style.display = 'none';
  document.getElementById('video-preview-section').style.display = 'block';
  
  editorState.videoElement = videoElement;
  
  // Update trim end based on duration
  videoElement.addEventListener('loadedmetadata', () => {
    const duration = videoElement.duration;
    editorState.trimEnd = Math.min(duration, 30);
    document.getElementById('trim-end').value = editorState.trimEnd.toFixed(1);
    document.getElementById('trim-end').max = duration.toFixed(1);
  });
}

// Retake video
document.getElementById('retake-video-btn').addEventListener('click', () => {
  editorState.videoFile = null;
  editorState.videoBlob = null;
  document.getElementById('video-preview-section').style.display = 'none';
  document.getElementById('video-source-options').style.display = 'grid';
});

// Continue to music selection
document.getElementById('continue-to-music-btn').addEventListener('click', () => {
  showSection('music-section');
  loadArtistSongs();
});

// ============================================
// STEP 2: ADD MUSIC
// ============================================

async function loadArtistSongs() {
  const listElement = document.getElementById('your-songs-list');
  listElement.innerHTML = '<div class="loading">Loading your songs...</div>';
  
  try {
    const { data: songs, error } = await supabase
      .from('songs')
      .select('id, title, audio_file_url, cover_art_url')
      .eq('artist_id', artistId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (!songs || songs.length === 0) {
      listElement.innerHTML = '<p style="color: #888;">No songs uploaded yet</p>';
      return;
    }
    
    listElement.innerHTML = songs.map(song => `
      <div class="song-item" data-song-id="${song.id}" data-audio-url="${song.audio_file_url}">
        <img src="${song.cover_art_url}" alt="${song.title}">
        <div class="song-info">
          <p class="song-title">${song.title}</p>
        </div>
        <button class="btn-select-song">Select</button>
      </div>
    `).join('');
    
    // Add click handlers
    document.querySelectorAll('.btn-select-song').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const songItem = e.target.closest('.song-item');
        selectSong(
          songItem.dataset.songId,
          songItem.querySelector('.song-title').textContent,
          songItem.dataset.audioUrl
        );
      });
    });
    
  } catch (error) {
    console.error('Error loading songs:', error);
    listElement.innerHTML = '<p style="color: #E91E8C;">Error loading songs</p>';
  }
}

function selectSong(songId, title, audioUrl) {
  editorState.selectedSongId = songId;
  editorState.audioFile = null; // Clear uploaded audio
  
  // Load audio
  const audioElement = document.createElement('audio');
  audioElement.src = audioUrl;
  editorState.audioElement = audioElement;
  
  // Update UI
  document.getElementById('music-name').textContent = `🎵 ${title}`;
  document.getElementById('continue-to-edit-btn').disabled = false;
  
  // Highlight selected
  document.querySelectorAll('.song-item').forEach(item => {
    item.classList.remove('selected');
  });
  document.querySelector(`[data-song-id="${songId}"]`)?.classList.add('selected');
  
  console.log('✅ Song selected:', title);
}

// Upload new audio
document.getElementById('audio-upload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('audio/')) {
    alert('Please upload an audio file');
    return;
  }
  
  editorState.audioFile = file;
  editorState.selectedSongId = null; // Clear selected song
  
  // Show preview
  const audioElement = document.getElementById('audio-element');
  audioElement.src = URL.createObjectURL(file);
  document.getElementById('audio-filename').textContent = file.name;
  document.getElementById('audio-preview').style.display = 'block';
  
  editorState.audioElement = audioElement;
  
  // Update UI
  document.getElementById('music-name').textContent = `📁 ${file.name}`;
  document.getElementById('continue-to-edit-btn').disabled = false;
  
  // Clear song selection
  document.querySelectorAll('.song-item').forEach(item => {
    item.classList.remove('selected');
  });
  
  console.log('✅ Audio uploaded:', file.name);
});

// No music option
document.getElementById('no-music-btn').addEventListener('click', () => {
  editorState.selectedSongId = null;
  editorState.audioFile = null;
  editorState.audioElement = null;
  
  document.getElementById('music-name').textContent = '🔇 Original audio';
  document.getElementById('continue-to-edit-btn').disabled = false;
  
  // Clear selections
  document.querySelectorAll('.song-item').forEach(item => {
    item.classList.remove('selected');
  });
  document.getElementById('audio-preview').style.display = 'none';
  
  console.log('✅ Using original audio');
});

// Navigation
document.getElementById('back-to-video-btn').addEventListener('click', () => {
  showSection('video-source-section');
  document.getElementById('video-preview-section').style.display = 'block';
});

document.getElementById('continue-to-edit-btn').addEventListener('click', () => {
  initializeEditor();
  showSection('edit-section');
});

// ============================================
// STEP 3: EDIT VIDEO
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
  
  // Update trim status
  const duration = video.duration;
  const trimmed = editorState.trimEnd - editorState.trimStart;
  document.getElementById('trim-status').textContent = 
    `Video: ${formatTime(duration)} | Trimmed to: ${formatTime(trimmed)}`;
}

// Play/pause control
document.getElementById('play-pause-btn').addEventListener('click', () => {
  const video = editorState.videoElement;
  const btn = document.getElementById('play-pause-btn');
  
  if (video.paused) {
    video.play();
    btn.textContent = '⏸️';
  } else {
    video.pause();
    btn.textContent = '▶️';
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
  
  // Update status
  document.getElementById('trim-status').textContent = 
    `Video trimmed to: ${formatTime(end - start)} (${formatTime(start)} - ${formatTime(end)})`;
  
  console.log(`✂️ Video trimmed: ${start}s - ${end}s`);
});

// Text overlay (same as before)
document.getElementById('add-text-btn').addEventListener('click', () => {
  const text = document.getElementById('text-input').value.trim();
  if (!text) return;

  const textOverlay = {
    id: Date.now(),
    text: text,
    color: document.getElementById('text-color').value,
    font: document.getElementById('text-font').value,
    size: parseInt(document.getElementById('text-size').value),
    x: 50,
    y: 50
  };

  editorState.textOverlays.push(textOverlay);
  renderTextOverlay(textOverlay);
  updateTextList();
  
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
    pointer-events: all;
  `;
  textElement.textContent = overlay.text;
  
  // Make draggable
  let isDragging = false;
  let startX, startY;
  
  textElement.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    const containerRect = container.getBoundingClientRect();
    overlay.x += (deltaX / containerRect.width) * 100;
    overlay.y += (deltaY / containerRect.height) * 100;
    
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

// Change music
document.getElementById('change-music-btn').addEventListener('click', () => {
  showSection('music-section');
});

document.getElementById('back-to-music-btn').addEventListener('click', () => {
  showSection('music-section');
});

// ============================================
// STEP 4: SAVE VIDEO
// ============================================

document.getElementById('save-video-btn').addEventListener('click', async () => {
  if (!confirm('Save this video and return to Turntbl?')) return;

  showSection('saving-section');
  document.getElementById('save-status').textContent = 'Preparing video...';

  try {
    // For MVP: Just save the original video file
    // In Phase 2, we'll implement actual trimming and text burning
    
    let finalVideo = editorState.videoFile;
    
    // Prepare form data with just the video
    const formData = new FormData();
    formData.append('video', finalVideo);
    formData.append('artist_id', artistId);
    
    // Add audio if selected/uploaded
    if (editorState.audioFile) {
      formData.append('audio', editorState.audioFile);
    } else if (editorState.selectedSongId) {
      formData.append('song_id', editorState.selectedSongId);
    }
    
    // Add metadata about edits (for future processing)
    formData.append('trim_start', editorState.trimStart.toString());
    formData.append('trim_end', editorState.trimEnd.toString());
    formData.append('text_overlays', JSON.stringify(editorState.textOverlays));
    
    document.getElementById('save-status').textContent = 'Uploading to Turntbl...';
    
    // For now, just store the video and redirect back
    // getturntbl.com will handle adding title, cover art, and publishing
    
    // Upload video to Supabase storage directly
    const videoFileName = `${artistId}/${Date.now()}_promo.mp4`;
    const { error: uploadError } = await supabase.storage
      .from('songs')
      .upload(videoFileName, finalVideo);
    
    if (uploadError) throw uploadError;
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('songs')
      .getPublicUrl(videoFileName);
    
    // Redirect back with video URL
    const videoUrl = encodeURIComponent(publicUrl);
    const audioUrl = editorState.audioFile ? 
      encodeURIComponent(URL.createObjectURL(editorState.audioFile)) : '';
    const songId = editorState.selectedSongId || '';
    
    document.getElementById('save-status').textContent = 'Success! Redirecting...';
    
    setTimeout(() => {
      window.location.href = `${returnUrl}?video_url=${videoUrl}&song_id=${songId}&from_studio=true`;
    }, 1000);

  } catch (error) {
    console.error('Save error:', error);
    alert(`Failed to save: ${error.message}`);
    showSection('edit-section');
  }
});

// Helper functions
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Cancel button
document.getElementById('cancel-btn').addEventListener('click', () => {
  if (confirm('Are you sure? All changes will be lost.')) {
    stopCamera();
    window.location.href = returnUrl;
  }
});
