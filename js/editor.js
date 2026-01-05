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

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
  console.log('✅ App initialized');
  setupEventListeners();
}

// Section navigation
function showSection(sectionId) {
  document.querySelectorAll('.editor-section').forEach(section => {
    section.classList.remove('active');
  });
  const targetSection = document.getElementById(sectionId);
  if (targetSection) {
    targetSection.classList.add('active');
  }
}

// ============================================
// SETUP EVENT LISTENERS
// ============================================

function setupEventListeners() {
  // Step 1: Video Source
  const startRecordingBtn = document.getElementById('start-recording-btn');
  const backToOptionsBtn = document.getElementById('back-to-options-btn');
  const videoUploadInput = document.getElementById('video-upload');
  const retakeVideoBtn = document.getElementById('retake-video-btn');
  const continueToMusicBtn = document.getElementById('continue-to-music-btn');
  
  if (startRecordingBtn) {
    startRecordingBtn.addEventListener('click', handleStartRecording);
  }
  
  if (backToOptionsBtn) {
    backToOptionsBtn.addEventListener('click', handleBackToOptions);
  }
  
  if (videoUploadInput) {
    videoUploadInput.addEventListener('change', handleVideoUpload);
  }
  
  if (retakeVideoBtn) {
    retakeVideoBtn.addEventListener('click', handleRetakeVideo);
  }
  
  if (continueToMusicBtn) {
    continueToMusicBtn.addEventListener('click', handleContinueToMusic);
  }
  
  // Recording controls
  const flipCameraBtn = document.getElementById('flip-camera-btn');
  const recordBtn = document.getElementById('record-btn');
  const stopRecordingBtn = document.getElementById('stop-recording-btn');
  
  if (flipCameraBtn) {
    flipCameraBtn.addEventListener('click', handleFlipCamera);
  }
  
  if (recordBtn) {
    recordBtn.addEventListener('click', handleRecordBtn);
  }
  
  if (stopRecordingBtn) {
    stopRecordingBtn.addEventListener('click', handleStopRecording);
  }
  
  // Step 2: Music
  const audioUploadInput = document.getElementById('audio-upload');
  const noMusicBtn = document.getElementById('no-music-btn');
  const backToVideoBtn = document.getElementById('back-to-video-btn');
  const continueToEditBtn = document.getElementById('continue-to-edit-btn');
  
  if (audioUploadInput) {
    audioUploadInput.addEventListener('change', handleAudioUpload);
  }
  
  if (noMusicBtn) {
    noMusicBtn.addEventListener('click', handleNoMusic);
  }
  
  if (backToVideoBtn) {
    backToVideoBtn.addEventListener('click', () => {
      showSection('video-source-section');
      const videoPreviewSection = document.getElementById('video-preview-section');
      if (videoPreviewSection) {
        videoPreviewSection.style.display = 'block';
      }
    });
  }
  
  if (continueToEditBtn) {
    continueToEditBtn.addEventListener('click', () => {
      initializeEditor();
      showSection('edit-section');
    });
  }
  
  // Step 3: Editor
  const playPauseBtn = document.getElementById('play-pause-btn');
  const videoScrubber = document.getElementById('video-scrubber');
  const applyTrimBtn = document.getElementById('apply-trim-btn');
  const addTextBtn = document.getElementById('add-text-btn');
  const changeMusicBtn = document.getElementById('change-music-btn');
  const backToMusicBtn = document.getElementById('back-to-music-btn');
  const saveVideoBtn = document.getElementById('save-video-btn');
  
  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', handlePlayPause);
  }
  
  if (videoScrubber) {
    videoScrubber.addEventListener('input', handleScrubber);
  }
  
  if (applyTrimBtn) {
    applyTrimBtn.addEventListener('click', handleApplyTrim);
  }
  
  if (addTextBtn) {
    addTextBtn.addEventListener('click', handleAddText);
  }
  
  if (changeMusicBtn) {
    changeMusicBtn.addEventListener('click', () => showSection('music-section'));
  }
  
  if (backToMusicBtn) {
    backToMusicBtn.addEventListener('click', () => showSection('music-section'));
  }
  
  if (saveVideoBtn) {
    saveVideoBtn.addEventListener('click', handleSaveVideo);
  }
  
  // Cancel button
  const cancelBtn = document.getElementById('cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', handleCancel);
  }
}

// ============================================
// STEP 1: RECORD OR UPLOAD VIDEO
// ============================================

async function handleStartRecording() {
  const videoSourceOptions = document.getElementById('video-source-options');
  const recordingInterface = document.getElementById('recording-interface');
  
  if (videoSourceOptions) videoSourceOptions.style.display = 'none';
  if (recordingInterface) recordingInterface.style.display = 'block';
  
  await startCamera();
}

function handleBackToOptions() {
  stopCamera();
  
  const recordingInterface = document.getElementById('recording-interface');
  const videoSourceOptions = document.getElementById('video-source-options');
  
  if (recordingInterface) recordingInterface.style.display = 'none';
  if (videoSourceOptions) videoSourceOptions.style.display = 'grid';
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: editorState.facingMode },
      audio: true
    });
    
    editorState.recordingStream = stream;
    const preview = document.getElementById('camera-preview');
    if (preview) {
      preview.srcObject = stream;
    }
    
    console.log('✅ Camera started');
  } catch (error) {
    console.error('Camera error:', error);
    alert('Could not access camera: ' + error.message);
    handleBackToOptions();
  }
}

function stopCamera() {
  if (editorState.recordingStream) {
    editorState.recordingStream.getTracks().forEach(track => track.stop());
    editorState.recordingStream = null;
  }
}

async function handleFlipCamera() {
  editorState.facingMode = editorState.facingMode === 'user' ? 'environment' : 'user';
  stopCamera();
  await startCamera();
}

function handleRecordBtn() {
  if (!editorState.mediaRecorder || editorState.mediaRecorder.state === 'inactive') {
    startRecording();
  }
}

function handleStopRecording() {
  stopRecording();
}

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
  const recordBtn = document.getElementById('record-btn');
  const stopRecordingBtn = document.getElementById('stop-recording-btn');
  const recordingTimer = document.getElementById('recording-timer');
  const flipCameraBtn = document.getElementById('flip-camera-btn');
  
  if (recordBtn) recordBtn.style.display = 'none';
  if (stopRecordingBtn) stopRecordingBtn.style.display = 'block';
  if (recordingTimer) recordingTimer.style.display = 'block';
  if (flipCameraBtn) flipCameraBtn.disabled = true;
  
  // Start timer
  const timerInterval = setInterval(() => {
    if (!editorState.mediaRecorder || editorState.mediaRecorder.state !== 'recording') {
      clearInterval(timerInterval);
      return;
    }
    
    const elapsed = (Date.now() - editorState.recordingStartTime) / 1000;
    const timerElement = document.getElementById('recording-timer');
    if (timerElement) {
      timerElement.textContent = formatTime(elapsed);
    }
    
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
    const recordBtn = document.getElementById('record-btn');
    const stopRecordingBtn = document.getElementById('stop-recording-btn');
    const recordingTimer = document.getElementById('recording-timer');
    const flipCameraBtn = document.getElementById('flip-camera-btn');
    
    if (recordBtn) recordBtn.style.display = 'block';
    if (stopRecordingBtn) stopRecordingBtn.style.display = 'none';
    if (recordingTimer) recordingTimer.style.display = 'none';
    if (flipCameraBtn) flipCameraBtn.disabled = false;
    
    console.log('⏹️ Recording stopped');
  }
}

function handleRecordedVideo(blob) {
  editorState.videoBlob = blob;
  editorState.videoFile = new File([blob], 'recorded-video.webm', { type: 'video/webm' });
  
  // Show preview
  showVideoPreview(URL.createObjectURL(blob), 'Recorded video');
}

function handleVideoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('video/')) {
    alert('Please upload a video file');
    return;
  }
  
  editorState.videoFile = file;
  showVideoPreview(URL.createObjectURL(file), file.name);
}

function showVideoPreview(url, filename) {
  const videoElement = document.getElementById('preview-video');
  if (videoElement) {
    videoElement.src = url;
  }
  
  const filenameElement = document.getElementById('video-filename');
  if (filenameElement) {
    filenameElement.textContent = filename;
  }
  
  // Hide source options, show preview
  const videoSourceOptions = document.getElementById('video-source-options');
  const recordingInterface = document.getElementById('recording-interface');
  const videoPreviewSection = document.getElementById('video-preview-section');
  
  if (videoSourceOptions) videoSourceOptions.style.display = 'none';
  if (recordingInterface) recordingInterface.style.display = 'none';
  if (videoPreviewSection) videoPreviewSection.style.display = 'block';
  
  editorState.videoElement = videoElement;
  
  // Update trim end based on duration
  if (videoElement) {
    videoElement.addEventListener('loadedmetadata', () => {
      const duration = videoElement.duration;
      editorState.trimEnd = Math.min(duration, 30);
      
      const trimEndInput = document.getElementById('trim-end');
      if (trimEndInput) {
        trimEndInput.value = editorState.trimEnd.toFixed(1);
        trimEndInput.max = duration.toFixed(1);
      }
    });
  }
}

function handleRetakeVideo() {
  editorState.videoFile = null;
  editorState.videoBlob = null;
  
  const videoPreviewSection = document.getElementById('video-preview-section');
  const videoSourceOptions = document.getElementById('video-source-options');
  
  if (videoPreviewSection) videoPreviewSection.style.display = 'none';
  if (videoSourceOptions) videoSourceOptions.style.display = 'grid';
}

function handleContinueToMusic() {
  showSection('music-section');
  loadArtistSongs();
}

// ============================================
// STEP 2: ADD MUSIC
// ============================================

async function loadArtistSongs() {
  const listElement = document.getElementById('your-songs-list');
  if (!listElement) return;
  
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
        if (songItem) {
          selectSong(
            songItem.dataset.songId,
            songItem.querySelector('.song-title').textContent,
            songItem.dataset.audioUrl
          );
        }
      });
    });
    
  } catch (error) {
    console.error('Error loading songs:', error);
    listElement.innerHTML = '<p style="color: #E91E8C;">Error loading songs</p>';
  }
}

function selectSong(songId, title, audioUrl) {
  editorState.selectedSongId = songId;
  editorState.audioFile = null;
  
  // Load audio
  const audioElement = document.createElement('audio');
  audioElement.src = audioUrl;
  editorState.audioElement = audioElement;
  
  // Update UI
  const musicNameElement = document.getElementById('music-name');
  const continueBtn = document.getElementById('continue-to-edit-btn');
  
  if (musicNameElement) musicNameElement.textContent = `🎵 ${title}`;
  if (continueBtn) continueBtn.disabled = false;
  
  // Highlight selected
  document.querySelectorAll('.song-item').forEach(item => {
    item.classList.remove('selected');
  });
  const selectedItem = document.querySelector(`[data-song-id="${songId}"]`);
  if (selectedItem) selectedItem.classList.add('selected');
  
  console.log('✅ Song selected:', title);
}

function handleAudioUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('audio/')) {
    alert('Please upload an audio file');
    return;
  }
  
  editorState.audioFile = file;
  editorState.selectedSongId = null;
  
  // Show preview
  const audioElement = document.getElementById('audio-element');
  const audioFilename = document.getElementById('audio-filename');
  const audioPreview = document.getElementById('audio-preview');
  
  if (audioElement) {
    audioElement.src = URL.createObjectURL(file);
    editorState.audioElement = audioElement;
  }
  
  if (audioFilename) audioFilename.textContent = file.name;
  if (audioPreview) audioPreview.style.display = 'block';
  
  // Update UI
  const musicNameElement = document.getElementById('music-name');
  const continueBtn = document.getElementById('continue-to-edit-btn');
  
  if (musicNameElement) musicNameElement.textContent = `📁 ${file.name}`;
  if (continueBtn) continueBtn.disabled = false;
  
  // Clear song selection
  document.querySelectorAll('.song-item').forEach(item => {
    item.classList.remove('selected');
  });
  
  console.log('✅ Audio uploaded:', file.name);
}

function handleNoMusic() {
  editorState.selectedSongId = null;
  editorState.audioFile = null;
  editorState.audioElement = null;
  
  const musicNameElement = document.getElementById('music-name');
  const continueBtn = document.getElementById('continue-to-edit-btn');
  const audioPreview = document.getElementById('audio-preview');
  
  if (musicNameElement) musicNameElement.textContent = '🔇 Original audio';
  if (continueBtn) continueBtn.disabled = false;
  if (audioPreview) audioPreview.style.display = 'none';
  
  // Clear selections
  document.querySelectorAll('.song-item').forEach(item => {
    item.classList.remove('selected');
  });
  
  console.log('✅ Using original audio');
}

// ============================================
// STEP 3: EDIT VIDEO
// ============================================

function initializeEditor() {
  const canvas = document.getElementById('preview-canvas');
  const video = editorState.videoElement;
  
  if (!canvas || !video) return;
  
  const ctx = canvas.getContext('2d');

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
    
    const currentTimeEl = document.getElementById('current-time');
    const totalTimeEl = document.getElementById('total-time');
    const scrubber = document.getElementById('video-scrubber');
    
    if (currentTimeEl) currentTimeEl.textContent = formatTime(current);
    if (totalTimeEl) totalTimeEl.textContent = formatTime(duration);
    if (scrubber) scrubber.value = (current / duration) * 100;
  });
  
  // Update trim status
  const duration = video.duration;
  const trimmed = editorState.trimEnd - editorState.trimStart;
  const trimStatus = document.getElementById('trim-status');
  if (trimStatus) {
    trimStatus.textContent = `Video: ${formatTime(duration)} | Trimmed to: ${formatTime(trimmed)}`;
  }
}

function handlePlayPause() {
  const video = editorState.videoElement;
  const btn = document.getElementById('play-pause-btn');
  
  if (!video || !btn) return;
  
  if (video.paused) {
    video.play();
    btn.textContent = '⏸️';
  } else {
    video.pause();
    btn.textContent = '▶️';
  }
}

function handleScrubber(e) {
  const video = editorState.videoElement;
  if (!video) return;
  
  const percent = e.target.value / 100;
  video.currentTime = video.duration * percent;
}

function handleApplyTrim() {
  const trimStartInput = document.getElementById('trim-start');
  const trimEndInput = document.getElementById('trim-end');
  const video = editorState.videoElement;
  
  if (!trimStartInput || !trimEndInput || !video) return;
  
  const start = parseFloat(trimStartInput.value);
  const end = parseFloat(trimEndInput.value);

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
  const trimStatus = document.getElementById('trim-status');
  if (trimStatus) {
    trimStatus.textContent = `Video trimmed to: ${formatTime(end - start)} (${formatTime(start)} - ${formatTime(end)})`;
  }
  
  console.log(`✂️ Video trimmed: ${start}s - ${end}s`);
}

function handleAddText() {
  const textInput = document.getElementById('text-input');
  if (!textInput) return;
  
  const text = textInput.value.trim();
  if (!text) return;

  const textColorInput = document.getElementById('text-color');
  const textFontSelect = document.getElementById('text-font');
  const textSizeInput = document.getElementById('text-size');

  const textOverlay = {
    id: Date.now(),
    text: text,
    color: textColorInput ? textColorInput.value : '#ffffff',
    font: textFontSelect ? textFontSelect.value : 'Arial',
    size: textSizeInput ? parseInt(textSizeInput.value) : 48,
    x: 50,
    y: 50
  };

  editorState.textOverlays.push(textOverlay);
  renderTextOverlay(textOverlay);
  updateTextList();
  
  textInput.value = '';
}

function renderTextOverlay(overlay) {
  const container = document.getElementById('text-overlay-container');
  if (!container) return;
  
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
  if (!list) return;
  
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
  const textElement = document.getElementById(`text-${id}`);
  if (textElement) textElement.remove();
  updateTextList();
};

// ============================================
// STEP 4: SAVE VIDEO
// ============================================

async function handleSaveVideo() {
  if (!confirm('Save this video and return to Turntbl?')) return;

  showSection('saving-section');
  
  const saveStatus = document.getElementById('save-status');
  if (saveStatus) saveStatus.textContent = 'Preparing video...';

  try {
    let finalVideo = editorState.videoFile;
    
    if (saveStatus) saveStatus.textContent = 'Uploading to Turntbl...';
    
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
    
    if (saveStatus) saveStatus.textContent = 'Success! Redirecting...';
    
    setTimeout(() => {
      window.location.href = `${returnUrl}?video_url=${videoUrl}&song_id=${songId}&from_studio=true`;
    }, 1000);

  } catch (error) {
    console.error('Save error:', error);
    alert(`Failed to save: ${error.message}`);
    showSection('edit-section');
  }
}

// Helper functions
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function handleCancel() {
  if (confirm('Are you sure? All changes will be lost.')) {
    stopCamera();
    window.location.href = returnUrl;
  }
}
