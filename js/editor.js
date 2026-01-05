// js/editor.js

import { supabase, UPLOAD_FUNCTION_URL } from './config.js';

// ============================================
// STATE MACHINE
// ============================================

const AppState = {
  CAMERA_READY: 'camera_ready',
  COUNTDOWN: 'countdown',
  RECORDING: 'recording',
  POST_RECORD_REVIEW: 'review',
  EDIT_MODE: 'edit',
  SAVING: 'saving'
};

let currentState = AppState.CAMERA_READY;

// ============================================
// GLOBAL STATE
// ============================================

const editorState = {
  // Video
  videoFile: null,
  videoBlob: null,
  videoElement: null,
  videoDuration: 0,
  
  // Audio
  audioFile: null,
  selectedSongId: null,
  audioElement: null,
  
  // Camera
  cameraStream: null,
  facingMode: 'user', // 'user' = front, 'environment' = back
  flashEnabled: false,
  
  // Recording
  mediaRecorder: null,
  recordedChunks: [],
  recordingStartTime: null,
  recordingTimerInterval: null,
  
  // Editing
  trimStart: 0,
  trimEnd: 30,
  textOverlays: [],
  
  // Auth
  token: sessionStorage.getItem('turntbl_token'),
  artistId: sessionStorage.getItem('turntbl_artist_id'),
  returnUrl: sessionStorage.getItem('turntbl_return_url'),
};

// ============================================
// INITIALIZATION
// ============================================

// Check auth
if (!editorState.token || !editorState.artistId) {
  window.location.href = '/';
}

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ Turntbl Studio initialized');
  initializeApp();
});

function initializeApp() {
  setupEventListeners();
  startCamera();
}

// ============================================
// VIEW MANAGEMENT
// ============================================

function showView(viewId) {
  document.querySelectorAll('.view').forEach(view => {
    view.classList.remove('active');
  });
  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.add('active');
  }
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
  // Camera View
  document.getElementById('cancel-btn')?.addEventListener('click', handleCancel);
  document.getElementById('flash-btn')?.addEventListener('click', handleFlashToggle);
  document.getElementById('upload-btn')?.addEventListener('click', handleUploadClick);
  document.getElementById('effects-btn')?.addEventListener('click', () => showTooltip('Coming Soon!'));
  document.getElementById('timer-btn')?.addEventListener('click', () => showTooltip('Coming Soon!'));
  document.getElementById('record-btn')?.addEventListener('click', handleRecordClick);
  document.getElementById('flip-camera-btn')?.addEventListener('click', handleFlipCamera);
  document.getElementById('video-upload-input')?.addEventListener('change', handleVideoUpload);
  
  // Review View
  document.getElementById('review-cancel-btn')?.addEventListener('click', handleCancel);
  document.getElementById('review-scrubber')?.addEventListener('input', handleReviewScrub);
  document.getElementById('retake-btn')?.addEventListener('click', handleRetake);
  document.getElementById('continue-btn')?.addEventListener('click', handleContinueToEdit);
  
  // Edit View
  document.getElementById('edit-cancel-btn')?.addEventListener('click', handleCancel);
  document.getElementById('next-btn')?.addEventListener('click', handleSaveVideo);
  document.getElementById('play-pause-btn')?.addEventListener('click', handlePlayPause);
  document.getElementById('edit-scrubber')?.addEventListener('input', handleEditScrub);
  
  // Tool Tabs
  document.querySelectorAll('.tool-tab').forEach(tab => {
    tab.addEventListener('click', () => openToolDrawer(tab.dataset.tool));
  });
  
  // Close Drawer Buttons
  document.querySelectorAll('.close-drawer-btn').forEach(btn => {
    btn.addEventListener('click', closeToolDrawer);
  });
  
  // Music Drawer
  document.getElementById('audio-upload-input')?.addEventListener('change', handleAudioUpload);
  document.getElementById('original-audio-btn')?.addEventListener('click', handleOriginalAudio);
  
  // Text Drawer
  document.getElementById('add-text-btn')?.addEventListener('click', handleAddText);
  
  // Trim Drawer
  document.getElementById('apply-trim-btn')?.addEventListener('click', handleApplyTrim);
}

// ============================================
// CAMERA MANAGEMENT
// ============================================

async function startCamera() {
  try {
    const constraints = {
      video: {
        facingMode: editorState.facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: true
    };
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    editorState.cameraStream = stream;
    
    const preview = document.getElementById('camera-preview');
    if (preview) {
      preview.srcObject = stream;
    }
    
    // Check if flash is available
    const videoTrack = stream.getVideoTracks()[0];
    const capabilities = videoTrack.getCapabilities();
    
    const flashBtn = document.getElementById('flash-btn');
    if (!capabilities.torch) {
      // Flash not available, disable button
      if (flashBtn) {
        flashBtn.disabled = true;
        flashBtn.style.opacity = '0.5';
      }
    }
    
    console.log('✅ Camera started');
  } catch (error) {
    console.error('❌ Camera error:', error);
    alert('Could not access camera. Please enable camera permissions or use Upload instead.');
  }
}

function stopCamera() {
  if (editorState.cameraStream) {
    editorState.cameraStream.getTracks().forEach(track => track.stop());
    editorState.cameraStream = null;
  }
}

async function handleFlipCamera() {
  editorState.facingMode = editorState.facingMode === 'user' ? 'environment' : 'user';
  stopCamera();
  await startCamera();
}

async function handleFlashToggle() {
  if (!editorState.cameraStream) return;
  
  const videoTrack = editorState.cameraStream.getVideoTracks()[0];
  const capabilities = videoTrack.getCapabilities();
  
  if (capabilities.torch) {
    editorState.flashEnabled = !editorState.flashEnabled;
    
    try {
      await videoTrack.applyConstraints({
        advanced: [{ torch: editorState.flashEnabled }]
      });
      
      const flashBtn = document.getElementById('flash-btn');
      if (flashBtn) {
        flashBtn.style.opacity = editorState.flashEnabled ? '1' : '0.6';
      }
    } catch (error) {
      console.error('Flash error:', error);
    }
  }
}

// ============================================
// RECORDING FLOW
// ============================================

async function handleRecordClick() {
  if (currentState !== AppState.CAMERA_READY) return;
  
  currentState = AppState.COUNTDOWN;
  await startCountdown();
}

async function startCountdown() {
  const overlay = document.getElementById('countdown-overlay');
  const numberElement = document.getElementById('countdown-number');
  
  if (!overlay || !numberElement) return;
  
  overlay.classList.add('active');
  
  // Hide bottom controls during countdown
  const bottomControls = document.querySelector('.bottom-controls');
  if (bottomControls) bottomControls.style.opacity = '0.3';
  
  // 3
  numberElement.textContent = '3';
  numberElement.classList.add('animate');
  await wait(1000);
  numberElement.classList.remove('animate');
  
  // 2
  numberElement.textContent = '2';
  numberElement.classList.add('animate');
  await wait(1000);
  numberElement.classList.remove('animate');
  
  // 1
  numberElement.textContent = '1';
  numberElement.classList.add('animate');
  await wait(1000);
  numberElement.classList.remove('animate');
  
  // REC
  numberElement.textContent = '🔴 REC';
  numberElement.classList.add('animate');
  await wait(500);
  
  // Hide countdown, start recording
  overlay.classList.remove('active');
  if (bottomControls) bottomControls.style.opacity = '0';
  
  startRecording();
}

function startRecording() {
  currentState = AppState.RECORDING;
  editorState.recordedChunks = [];
  
  // Setup MediaRecorder
  const options = { mimeType: 'video/webm;codecs=vp8,opus' };
  
  try {
    editorState.mediaRecorder = new MediaRecorder(editorState.cameraStream, options);
  } catch (e) {
    console.error('MediaRecorder error:', e);
    alert('Recording not supported on this device');
    resetToCamera();
    return;
  }
  
  editorState.mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      editorState.recordedChunks.push(event.data);
    }
  };
  
  editorState.mediaRecorder.onstop = () => {
    const blob = new Blob(editorState.recordedChunks, { type: 'video/webm' });
    handleRecordingComplete(blob);
  };
  
  editorState.mediaRecorder.start();
  editorState.recordingStartTime = Date.now();
  
  // Show recording indicator
  const indicator = document.getElementById('recording-indicator');
  if (indicator) indicator.classList.add('active');
  
  // Update timer
  editorState.recordingTimerInterval = setInterval(() => {
    const elapsed = (Date.now() - editorState.recordingStartTime) / 1000;
    const timerElement = document.getElementById('recording-timer');
    if (timerElement) {
      timerElement.textContent = formatTime(elapsed);
    }
    
    // Auto-stop at 30 seconds
    if (elapsed >= 30) {
      stopRecording();
    }
  }, 100);
  
  // Make record button into stop button
  const recordBtn = document.getElementById('record-btn');
  if (recordBtn) {
    recordBtn.classList.add('recording');
    recordBtn.onclick = stopRecording;
  }
  
  console.log('🔴 Recording started');
}

function stopRecording() {
  if (editorState.mediaRecorder && editorState.mediaRecorder.state === 'recording') {
    editorState.mediaRecorder.stop();
    
    // Clear timer
    if (editorState.recordingTimerInterval) {
      clearInterval(editorState.recordingTimerInterval);
      editorState.recordingTimerInterval = null;
    }
    
    // Hide recording indicator
    const indicator = document.getElementById('recording-indicator');
    if (indicator) indicator.classList.remove('active');
    
    // Reset record button
    const recordBtn = document.getElementById('record-btn');
    if (recordBtn) {
      recordBtn.classList.remove('recording');
      recordBtn.onclick = handleRecordClick;
    }
    
    console.log('⏹️ Recording stopped');
  }
}

function handleRecordingComplete(blob) {
  editorState.videoBlob = blob;
  editorState.videoFile = new File([blob], 'recorded-video.webm', { type: 'video/webm' });
  
  stopCamera();
  showReviewScreen();
}

// ============================================
// UPLOAD FLOW
// ============================================

function handleUploadClick() {
  const input = document.getElementById('video-upload-input');
  if (input) input.click();
}

function handleVideoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('video/')) {
    alert('Please upload a video file');
    return;
  }
  
  editorState.videoFile = file;
  editorState.videoBlob = file;
  
  stopCamera();
  
  // Skip review, go straight to edit
  showEditScreen();
}

// ============================================
// REVIEW SCREEN
// ============================================

function showReviewScreen() {
  currentState = AppState.POST_RECORD_REVIEW;
  showView('review-view');
  
  const video = document.getElementById('review-video');
  if (!video) return;
  
  video.src = URL.createObjectURL(editorState.videoBlob);
  editorState.videoElement = video;
  
  // Wait 500ms then autoplay
  video.addEventListener('loadedmetadata', () => {
    editorState.videoDuration = video.duration;
    
    // Update duration display
    const durationDisplay = document.getElementById('review-duration');
    if (durationDisplay) {
      durationDisplay.textContent = formatTime(video.duration);
    }
    
    // Update scrubber
    const scrubberEnd = document.getElementById('scrubber-end');
    if (scrubberEnd) {
      scrubberEnd.textContent = formatTime(video.duration);
    }
    
    // Update trim end
    editorState.trimEnd = Math.min(video.duration, 30);
    
    // Autoplay after 500ms
    setTimeout(() => {
      video.play().catch(err => console.log('Autoplay prevented:', err));
    }, 500);
  });
  
  // Update scrubber as video plays
  video.addEventListener('timeupdate', () => {
    const scrubber = document.getElementById('review-scrubber');
    const startTime = document.getElementById('scrubber-start');
    
    if (scrubber && !scrubber.dataset.scrubbing) {
      scrubber.value = (video.currentTime / video.duration) * 100;
    }
    
    if (startTime) {
      startTime.textContent = formatTime(video.currentTime);
    }
  });
}

function handleReviewScrub(e) {
  const video = document.getElementById('review-video');
  const scrubber = e.target;
  
  if (!video) return;
  
  scrubber.dataset.scrubbing = 'true';
  const percent = scrubber.value / 100;
  video.currentTime = video.duration * percent;
  
  // Pause while scrubbing
  video.pause();
  
  // Resume after scrubbing stops
  clearTimeout(scrubber.resumeTimeout);
  scrubber.resumeTimeout = setTimeout(() => {
    delete scrubber.dataset.scrubbing;
    video.play();
  }, 500);
}

function handleRetake() {
  editorState.videoFile = null;
  editorState.videoBlob = null;
  editorState.videoElement = null;
  
  resetToCamera();
}

function resetToCamera() {
  currentState = AppState.CAMERA_READY;
  showView('camera-view');
  
  // Show bottom controls
  const bottomControls = document.querySelector('.bottom-controls');
  if (bottomControls) bottomControls.style.opacity = '1';
  
  startCamera();
}

function handleContinueToEdit() {
  showEditScreen();
}

// ============================================
// EDIT SCREEN
// ============================================

function showEditScreen() {
  currentState = AppState.EDIT_MODE;
  showView('edit-view');
  
  const video = document.getElementById('edit-video');
  if (!video) return;
  
  video.src = URL.createObjectURL(editorState.videoBlob || editorState.videoFile);
  editorState.videoElement = video;
  
  video.addEventListener('loadedmetadata', () => {
    editorState.videoDuration = video.duration;
    
    // Update duration display
    const durationDisplay = document.getElementById('edit-duration');
    if (durationDisplay) {
      durationDisplay.textContent = formatTime(video.duration);
    }
    
    // Setup canvas
    setupVideoCanvas();
    
    // Update trim end
    editorState.trimEnd = Math.min(video.duration, 30);
    const trimEndInput = document.getElementById('trim-end');
    if (trimEndInput) {
      trimEndInput.value = editorState.trimEnd.toFixed(1);
      trimEndInput.max = video.duration.toFixed(1);
    }
    
    // Autoplay
    video.play().catch(err => console.log('Autoplay prevented:', err));
  });
  
  // Update time display
  video.addEventListener('timeupdate', () => {
    const timeDisplay = document.getElementById('edit-time');
    const scrubber = document.getElementById('edit-scrubber');
    
    if (timeDisplay) {
      timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    }
    
    if (scrubber && !scrubber.dataset.scrubbing) {
      scrubber.value = (video.currentTime / video.duration) * 100;
    }
  });
  
  // Load artist songs for music drawer
  loadArtistSongs();
}

function setupVideoCanvas() {
  const canvas = document.getElementById('video-canvas');
  const video = document.getElementById('edit-video');
  
  if (!canvas || !video) return;
  
  const ctx = canvas.getContext('2d');
  
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  // Scale for display
  const container = canvas.parentElement;
  const containerWidth = container.offsetWidth;
  canvas.style.width = containerWidth + 'px';
  canvas.style.height = (containerWidth * (video.videoHeight / video.videoWidth)) + 'px';
  
  // Draw video frames
  function drawFrame() {
    if (!video.paused && !video.ended) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      requestAnimationFrame(drawFrame);
    }
  }
  
  video.addEventListener('play', drawFrame);
  video.addEventListener('seeked', () => {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  });
}

function handlePlayPause() {
  const video = document.getElementById('edit-video');
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

function handleEditScrub(e) {
  const video = document.getElementById('edit-video');
  const scrubber = e.target;
  
  if (!video) return;
  
  scrubber.dataset.scrubbing = 'true';
  const percent = scrubber.value / 100;
  video.currentTime = video.duration * percent;
  
  setTimeout(() => {
    delete scrubber.dataset.scrubbing;
  }, 100);
}

// ============================================
// TOOL DRAWERS
// ============================================

function openToolDrawer(toolName) {
  const drawer = document.getElementById('tool-drawer');
  const content = document.getElementById(`${toolName}-drawer`);
  
  if (!drawer || !content) return;
  
  // Hide all drawer contents
  document.querySelectorAll('.drawer-content').forEach(d => {
    d.classList.remove('active');
  });
  
  // Show selected drawer
  content.classList.add('active');
  drawer.classList.add('active');
}

function closeToolDrawer() {
  const drawer = document.getElementById('tool-drawer');
  if (drawer) {
    drawer.classList.remove('active');
  }
}

// ============================================
// MUSIC DRAWER
// ============================================

async function loadArtistSongs() {
  const listElement = document.getElementById('your-songs-list');
  if (!listElement) return;
  
  listElement.innerHTML = '<div class="loading">Loading...</div>';
  
  try {
    const { data: songs, error } = await supabase
      .from('songs')
      .select('id, title, audio_file_url, cover_art_url')
      .eq('artist_id', editorState.artistId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (!songs || songs.length === 0) {
      listElement.innerHTML = '<p class="empty-state">No songs yet</p>';
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
    listElement.innerHTML = '<p class="error-state">Error loading songs</p>';
  }
}

function selectSong(songId, title, audioUrl) {
  editorState.selectedSongId = songId;
  editorState.audioFile = null;
  
  // Highlight selected
  document.querySelectorAll('.song-item').forEach(item => {
    item.classList.remove('selected');
  });
  const selectedItem = document.querySelector(`[data-song-id="${songId}"]`);
  if (selectedItem) selectedItem.classList.add('selected');
  
  closeToolDrawer();
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
  
  if (audioElement) audioElement.src = URL.createObjectURL(file);
  if (audioFilename) audioFilename.textContent = file.name;
  if (audioPreview) audioPreview.style.display = 'block';
  
  // Clear song selection
  document.querySelectorAll('.song-item').forEach(item => {
    item.classList.remove('selected');
  });
  
  console.log('✅ Audio uploaded:', file.name);
}

function handleOriginalAudio() {
  editorState.selectedSongId = null;
  editorState.audioFile = null;
  
  // Clear selections
  document.querySelectorAll('.song-item').forEach(item => {
    item.classList.remove('selected');
  });
  
  const audioPreview = document.getElementById('audio-preview');
  if (audioPreview) audioPreview.style.display = 'none';
  
  closeToolDrawer();
  console.log('✅ Using original audio');
}

// ============================================
// TEXT DRAWER
// ============================================

function handleAddText() {
  const textInput = document.getElementById('text-input');
  if (!textInput) return;
  
  const text = textInput.value.trim();
  if (!text) return;
  
  const textColor = document.getElementById('text-color')?.value || '#ffffff';
  const textFont = document.getElementById('text-font')?.value || 'Arial';
  const textSize = parseInt(document.getElementById('text-size')?.value) || 48;
  
  const textOverlay = {
    id: Date.now(),
    text: text,
    color: textColor,
    font: textFont,
    size: textSize,
    x: 50,
    y: 50
  };
  
  editorState.textOverlays.push(textOverlay);
  renderTextOverlay(textOverlay);
  updateTextList();
  
  textInput.value = '';
  console.log('✅ Text added:', text);
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
  makeDraggable(textElement, overlay);
  
  container.appendChild(textElement);
}

function makeDraggable(element, overlay) {
  let isDragging = false;
  let startX, startY;
  
  const onStart = (e) => {
    isDragging = true;
    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
    startX = clientX;
    startY = clientY;
    e.preventDefault();
  };
  
  const onMove = (e) => {
    if (!isDragging) return;
    
    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
    
    const deltaX = clientX - startX;
    const deltaY = clientY - startY;
    
    const container = element.parentElement;
    const containerRect = container.getBoundingClientRect();
    
    overlay.x += (deltaX / containerRect.width) * 100;
    overlay.y += (deltaY / containerRect.height) * 100;
    
    overlay.x = Math.max(5, Math.min(95, overlay.x));
    overlay.y = Math.max(5, Math.min(95, overlay.y));
    
    element.style.left = overlay.x + '%';
    element.style.top = overlay.y + '%';
    
    startX = clientX;
    startY = clientY;
  };
  
  const onEnd = () => {
    isDragging = false;
  };
  
  // Mouse events
  element.addEventListener('mousedown', onStart);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);
  
  // Touch events
  element.addEventListener('touchstart', onStart);
  document.addEventListener('touchmove', onMove);
  document.addEventListener('touchend', onEnd);
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
      <button class="remove-text-btn" data-id="${overlay.id}">Remove</button>
    `;
    list.appendChild(item);
  });
  
  // Add remove handlers
  document.querySelectorAll('.remove-text-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      removeTextOverlay(id);
    });
  });
}

function removeTextOverlay(id) {
  editorState.textOverlays = editorState.textOverlays.filter(o => o.id !== id);
  const element = document.getElementById(`text-${id}`);
  if (element) element.remove();
  updateTextList();
}

// ============================================
// TRIM DRAWER
// ============================================

function handleApplyTrim() {
  const trimStart = parseFloat(document.getElementById('trim-start')?.value) || 0;
  const trimEnd = parseFloat(document.getElementById('trim-end')?.value) || 30;
  const video = editorState.videoElement;
  
  if (!video) return;
  
  if (trimStart < 0 || trimEnd > video.duration || trimStart >= trimEnd) {
    alert('Invalid trim values');
    return;
  }
  
  if (trimEnd - trimStart > 30) {
    alert('Video must be 30 seconds or less');
    return;
  }
  
  editorState.trimStart = trimStart;
  editorState.trimEnd = trimEnd;
  
  video.currentTime = trimStart;
  
  const trimStatus = document.getElementById('trim-status');
  if (trimStatus) {
    trimStatus.textContent = `✂️ Trimmed to ${formatTime(trimEnd - trimStart)} (${formatTime(trimStart)} - ${formatTime(trimEnd)})`;
  }
  
  closeToolDrawer();
  console.log(`✂️ Trim applied: ${trimStart}s - ${trimEnd}s`);
}

// ============================================
// SAVE & UPLOAD
// ============================================

async function handleSaveVideo() {
  if (!confirm('Save this video and return to Turntbl?')) return;
  
  currentState = AppState.SAVING;
  showView('saving-view');
  
  const saveStatus = document.getElementById('save-status');
  if (saveStatus) saveStatus.textContent = 'Preparing video...';
  
  try {
    const finalVideo = editorState.videoFile;
    
    if (saveStatus) saveStatus.textContent = 'Uploading to Turntbl...';
    
    // Upload video to Supabase storage
    const videoFileName = `${editorState.artistId}/${Date.now()}_promo.mp4`;
    const { error: uploadError } = await supabase.storage
      .from('songs')
      .upload(videoFileName, finalVideo);
    
    if (uploadError) throw uploadError;
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('songs')
      .getPublicUrl(videoFileName);
    
    if (saveStatus) saveStatus.textContent = 'Success! Redirecting...';
    
    // Redirect back to getturntbl.com
    const videoUrl = encodeURIComponent(publicUrl);
    const songId = editorState.selectedSongId || '';
    
    setTimeout(() => {
      window.location.href = `${editorState.returnUrl}?video_url=${videoUrl}&song_id=${songId}&from_studio=true`;
    }, 1000);
    
  } catch (error) {
    console.error('❌ Save error:', error);
    alert(`Failed to save: ${error.message}`);
    showView('edit-view');
    currentState = AppState.EDIT_MODE;
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function showTooltip(message) {
  const tooltip = document.getElementById('tooltip');
  if (!tooltip) return;
  
  tooltip.textContent = message;
  tooltip.classList.add('show');
  
  setTimeout(() => {
    tooltip.classList.remove('show');
  }, 2000);
}

function handleCancel() {
  if (confirm('Are you sure? All changes will be lost.')) {
    stopCamera();
    window.location.href = editorState.returnUrl;
  }
}
