// js/editor.js - COMPLETE FILE

import { supabase } from './config.js';

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
  videoThumbnails: [],
  
  // Audio
  audioFile: null,
  selectedSongId: null,
  selectedSong: null,
  audioElement: null,
  selectedSongDuration: 0,
  
  // Camera
  cameraStream: null,
  facingMode: 'user',
  flashEnabled: false,
  
  // Recording
  mediaRecorder: null,
  recordedChunks: [],
  recordingStartTime: null,
  recordingTimerInterval: null,
  
  // Editing
  trimStart: 0,
  trimEnd: 30,
  songTrimStart: 0,
  songTrimEnd: 0,
  songTimelineMax: 30,
  
  // Auth
  token: sessionStorage.getItem('turntbl_token'),
  artistId: sessionStorage.getItem('turntbl_artist_id'),
  returnUrl: sessionStorage.getItem('turntbl_return_url'),
};

// ============================================
// INITIALIZATION
// ============================================

if (!editorState.token || !editorState.artistId) {
  window.location.href = '/';
}

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
  document.getElementById('next-to-finalize-btn')?.addEventListener('click', handleNextToFinalize);
  document.getElementById('music-card')?.addEventListener('click', openMusicDrawer);
  document.getElementById('close-music-drawer')?.addEventListener('click', closeMusicDrawer);
  document.getElementById('use-original-audio')?.addEventListener('click', handleUseOriginalAudio);
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
    
    const videoTrack = stream.getVideoTracks()[0];
    const capabilities = videoTrack.getCapabilities();
    
    const flashBtn = document.getElementById('flash-btn');
    if (!capabilities.torch) {
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
  
  // GO
  numberElement.textContent = '•';
  numberElement.classList.add('animate');
  await wait(200);
  
  overlay.classList.remove('active');
  
  startRecording();
}

function startRecording() {
  currentState = AppState.RECORDING;
  document.body.classList.add('is-recording');
  editorState.recordedChunks = [];
  
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
  
  const indicator = document.getElementById('recording-indicator');
  if (indicator) indicator.classList.add('active');
  
  editorState.recordingTimerInterval = setInterval(() => {
    const elapsed = (Date.now() - editorState.recordingStartTime) / 1000;
    const timerElement = document.getElementById('recording-timer');
    if (timerElement) {
      timerElement.textContent = formatTime(elapsed);
    }
    
    if (elapsed >= 30) {
      stopRecording();
    }
  }, 100);
  
  const recordBtn = document.getElementById('record-btn');
  if (recordBtn) {
    recordBtn.classList.add('recording');
    recordBtn.onclick = stopRecording;
  }
  
  console.log('🔴 Recording started');
}

function stopRecording() {
  if (editorState.recordingTimerInterval) {
    clearInterval(editorState.recordingTimerInterval);
    editorState.recordingTimerInterval = null;
  }

  if (editorState.mediaRecorder && editorState.mediaRecorder.state === 'recording') {
    editorState.mediaRecorder.stop();
    document.body.classList.remove('is-recording');
    
    const indicator = document.getElementById('recording-indicator');
    if (indicator) indicator.classList.remove('active');
    
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
  
  video.addEventListener('loadedmetadata', () => {
    editorState.videoDuration = video.duration;
    
    const durationDisplay = document.getElementById('review-duration');
    if (durationDisplay) {
      durationDisplay.textContent = formatTime(video.duration);
    }
    
    const scrubberEnd = document.getElementById('scrubber-end');
    if (scrubberEnd) {
      scrubberEnd.textContent = formatTime(video.duration);
    }
    
    editorState.trimEnd = Math.min(video.duration, 30);
    
    setTimeout(() => {
      video.play().catch(err => console.log('Autoplay prevented:', err));
    }, 500);
  });
  
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
  
  video.pause();
  
  clearTimeout(scrubber.resumeTimeout);
  scrubber.resumeTimeout = setTimeout(() => {
    delete scrubber.dataset.scrubbing;
    video.play();
  }, 500);
}

function handleRetake() {
  const reviewVideo = document.getElementById('review-video');
  if (reviewVideo) {
    reviewVideo.pause();
    reviewVideo.currentTime = 0;
    reviewVideo.src = '';
  }
  
  editorState.videoFile = null;
  editorState.videoBlob = null;
  editorState.videoElement = null;
  
  resetToCamera();
}

function resetToCamera() {
  currentState = AppState.CAMERA_READY;
  showView('camera-view');
  
  const bottomControls = document.querySelector('.bottom-controls');
  if (bottomControls) bottomControls.style.opacity = '1';
  
  startCamera();
}

function handleContinueToEdit() {
  const reviewVideo = document.getElementById('review-video');
  if (reviewVideo) {
    reviewVideo.pause();
    reviewVideo.currentTime = 0;
  }
  
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
  video.muted = true;
  editorState.videoElement = video;
  
  video.addEventListener('loadedmetadata', async () => {
    editorState.videoDuration = video.duration;
    
    editorState.trimStart = 0;
    editorState.trimEnd = Math.min(video.duration, 30);
    
    const thumbnails = await generateVideoThumbnails(video, 10);
    renderVideoThumbnails(thumbnails);
    
    editorState.videoThumbnails = thumbnails;
    
    initializeTrimTimeline();
    
    video.play().catch(err => console.log('Autoplay prevented:', err));
  });
  
  video.addEventListener('timeupdate', () => {
    if (video.currentTime >= editorState.trimEnd) {
      video.currentTime = editorState.trimStart;
    }
    if (video.currentTime < editorState.trimStart) {
      video.currentTime = editorState.trimStart;
    }
  });
}

// ============================================
// VIDEO THUMBNAIL GENERATION
// ============================================

async function generateVideoThumbnails(videoElement, count = 10) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const thumbnails = [];
  
  canvas.width = 60;
  canvas.height = 80;
  
  const duration = videoElement.duration;
  const interval = duration / count;
  
  for (let i = 0; i < count; i++) {
    videoElement.currentTime = i * interval;
    
    await new Promise(resolve => {
      videoElement.onseeked = () => {
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        thumbnails.push(canvas.toDataURL('image/jpeg', 0.7));
        resolve();
      };
    });
  }
  
  videoElement.currentTime = 0;
  return thumbnails;
}

function renderVideoThumbnails(thumbnails) {
  const container = document.getElementById('video-thumbnails');
  if (!container) return;
  
  container.innerHTML = '';
  
  thumbnails.forEach((thumbnail, index) => {
    const img = document.createElement('img');
    img.src = thumbnail;
    img.className = 'timeline-thumbnail';
    img.alt = `Frame ${index + 1}`;
    container.appendChild(img);
  });
}

// ============================================
// TRIM TIMELINE
// ============================================

function initializeTrimTimeline() {
  const video = editorState.videoElement;
  if (!video) return;
  
  const container = document.querySelector('.video-timeline-container');
  const selection = document.getElementById('trim-selection');
  const leftHandle = document.getElementById('trim-handle-left');
  const rightHandle = document.getElementById('trim-handle-right');
  
  if (!container || !selection || !leftHandle || !rightHandle) return;
  
  const duration = video.duration;
  editorState.trimEnd = Math.min(duration, 30);
  
  updateTrimDisplay();
  
  makeTrimHandleDraggable(leftHandle, 'left', container, video, duration);
  makeTrimHandleDraggable(rightHandle, 'right', container, video, duration);
}

function makeTrimHandleDraggable(handle, side, container, video, duration) {
  let isDragging = false;
  let startX = 0;
  
  const onStart = (e) => {
    isDragging = true;
    startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    handle.classList.add('dragging');
    e.preventDefault();
  };
  
  const onMove = (e) => {
    if (!isDragging) return;
    
    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const deltaX = clientX - startX;
    
    const containerRect = container.getBoundingClientRect();
    const deltaPercent = (deltaX / containerRect.width) * 100;
    const deltaTime = (deltaPercent / 100) * duration;
    
    if (side === 'left') {
      let newStart = editorState.trimStart + deltaTime;
      newStart = Math.max(0, Math.min(newStart, editorState.trimEnd - 1));
      editorState.trimStart = newStart;
      video.currentTime = newStart;
    } else {
      let newEnd = editorState.trimEnd + deltaTime;
      newEnd = Math.min(duration, Math.max(newEnd, editorState.trimStart + 1));
      
      if (newEnd - editorState.trimStart > 30) {
        newEnd = editorState.trimStart + 30;
      }
      
      editorState.trimEnd = newEnd;
      video.currentTime = newEnd;
    }
    
    updateTrimDisplay();
    
    // Update song timeline if song is selected
    if (editorState.selectedSongId) {
      updateSongTimelineRange();
    }
    
    startX = clientX;
  };
  
  const onEnd = () => {
    if (isDragging) {
      isDragging = false;
      handle.classList.remove('dragging');
      video.currentTime = editorState.trimStart;
      video.play();
    }
  };
  
  handle.addEventListener('mousedown', onStart);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);
  
  handle.addEventListener('touchstart', onStart);
  document.addEventListener('touchmove', onMove);
  document.addEventListener('touchend', onEnd);
}

function updateTrimDisplay() {
  const selection = document.getElementById('trim-selection');
  const leftOverlay = document.getElementById('trim-overlay-left');
  const rightOverlay = document.getElementById('trim-overlay-right');
  const duration = editorState.videoElement?.duration || 30;
  
  if (selection) {
    const startPercent = (editorState.trimStart / duration) * 100;
    const endPercent = (editorState.trimEnd / duration) * 100;
    
    selection.style.left = startPercent + '%';
    selection.style.width = (endPercent - startPercent) + '%';
    
    // Update dark overlays
    if (leftOverlay) {
      leftOverlay.style.width = startPercent + '%';
    }
    if (rightOverlay) {
      rightOverlay.style.width = (100 - endPercent) + '%';
    }
  }
  
  const trimDuration = document.getElementById('trim-duration');
  const timelineStart = document.getElementById('timeline-start');
  const timelineEnd = document.getElementById('timeline-end');
  
  if (trimDuration) {
    const selected = editorState.trimEnd - editorState.trimStart;
    trimDuration.textContent = formatTime(selected);
  }
  
  if (timelineStart) timelineStart.textContent = formatTime(editorState.trimStart);
  if (timelineEnd) timelineEnd.textContent = formatTime(editorState.trimEnd);
}

// ============================================
// MUSIC INTEGRATION
// ============================================

function updateMusicCard(song) {
  const musicIcon = document.getElementById('music-icon');
  const musicInfo = document.getElementById('music-info');
  
  if (!musicIcon || !musicInfo) return;
  
  if (song) {
    musicIcon.innerHTML = `<img src="${song.cover_art_url}" alt="${song.title}">`;
    musicInfo.innerHTML = `
      <p class="music-title">${song.title}</p>
      <p class="music-artist">${song.artist_name || 'Artist'}</p>
    `;
    
    initializeSongTimeline(song);
  } else {
    musicIcon.innerHTML = '🎵';
    musicInfo.innerHTML = `
      <p class="music-title">Add Sound</p>
      <p class="music-artist">Choose from your songs</p>
    `;
    
    const songTimelineSection = document.getElementById('song-timeline-section');
    if (songTimelineSection) songTimelineSection.style.display = 'none';
  }
}

async function initializeSongTimeline(song) {
  const songTimelineSection = document.getElementById('song-timeline-section');
  if (!songTimelineSection) return;
  
  songTimelineSection.style.display = 'block';
  
  const previewAudio = document.getElementById('preview-audio');
  if (previewAudio) {
    previewAudio.src = song.audio_file_url;
    await previewAudio.load();
    
    editorState.audioElement = previewAudio;
    editorState.selectedSongDuration = previewAudio.duration;
    
    const videoDuration = editorState.trimEnd - editorState.trimStart;
    const buffer = 2;
    
    editorState.songTrimStart = 0;
    editorState.songTrimEnd = Math.min(videoDuration, previewAudio.duration);
    editorState.songTimelineMax = Math.min(previewAudio.duration, videoDuration + (buffer * 2));
    
    renderSongWaveform();
    initializeSongTrimHandles();
    syncAudioWithVideo();
  }
}

function updateSongTimelineRange() {
  const videoDuration = editorState.trimEnd - editorState.trimStart;
  const buffer = 2;
  
  editorState.songTimelineMax = Math.min(editorState.selectedSongDuration, videoDuration + (buffer * 2));
  
  // Adjust song trim end if it exceeds new range
  if (editorState.songTrimEnd > editorState.songTimelineMax) {
    editorState.songTrimEnd = Math.min(editorState.songTimelineMax, editorState.songTrimStart + videoDuration);
  }
  
  updateSongTrimDisplay();
}

function renderSongWaveform() {
  const waveform = document.getElementById('song-waveform');
  if (!waveform) return;
  
  waveform.innerHTML = '';
  
  for (let i = 0; i < 50; i++) {
    const bar = document.createElement('div');
    bar.className = 'waveform-bar';
    bar.style.height = (Math.random() * 60 + 40) + '%';
    waveform.appendChild(bar);
  }
}

function initializeSongTrimHandles() {
  const container = document.querySelector('.song-timeline-container');
  const selection = document.getElementById('song-selection');
  const leftHandle = document.getElementById('song-handle-left');
  const rightHandle = document.getElementById('song-handle-right');
  
  if (!container || !selection || !leftHandle || !rightHandle) return;
  
  updateSongTrimDisplay();
  
  makeSongHandleDraggable(leftHandle, 'left', container);
  makeSongHandleDraggable(rightHandle, 'right', container);
}

function makeSongHandleDraggable(handle, side, container) {
  let isDragging = false;
  let startX = 0;
  
  const onStart = (e) => {
    isDragging = true;
    startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    handle.classList.add('dragging');
    e.preventDefault();
  };
  
  const onMove = (e) => {
    if (!isDragging) return;
    
    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const deltaX = clientX - startX;
    
    const containerRect = container.getBoundingClientRect();
    const deltaPercent = (deltaX / containerRect.width) * 100;
    const deltaTime = (deltaPercent / 100) * editorState.songTimelineMax;
    
    const videoDuration = editorState.trimEnd - editorState.trimStart;
    
    if (side === 'left') {
      let newStart = editorState.songTrimStart + deltaTime;
      newStart = Math.max(0, Math.min(newStart, editorState.songTrimEnd - 1));
      editorState.songTrimStart = newStart;
    } else {
      let newEnd = editorState.songTrimEnd + deltaTime;
      const maxEnd = Math.min(editorState.selectedSongDuration, editorState.songTrimStart + videoDuration);
      newEnd = Math.min(maxEnd, Math.max(newEnd, editorState.songTrimStart + 1));
      editorState.songTrimEnd = newEnd;
    }
    
    updateSongTrimDisplay();
    syncAudioWithVideo();
    startX = clientX;
  };
  
  const onEnd = () => {
    if (isDragging) {
      isDragging = false;
      handle.classList.remove('dragging');
    }
  };
  
  handle.addEventListener('mousedown', onStart);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);
  
  handle.addEventListener('touchstart', onStart);
  document.addEventListener('touchmove', onMove);
  document.addEventListener('touchend', onEnd);
}

function updateSongTrimDisplay() {
  const selection = document.getElementById('song-selection');
  
  if (selection) {
    const startPercent = (editorState.songTrimStart / editorState.songTimelineMax) * 100;
    const endPercent = (editorState.songTrimEnd / editorState.songTimelineMax) * 100;
    
    selection.style.left = startPercent + '%';
    selection.style.width = (endPercent - startPercent) + '%';
  }
  
  const startTime = document.getElementById('song-start-time');
  const duration = document.getElementById('song-duration');
  const endTime = document.getElementById('song-end-time');
  
  if (startTime) startTime.textContent = formatTime(editorState.songTrimStart);
  if (endTime) endTime.textContent = formatTime(editorState.songTimelineMax);
  if (duration) {
    const selected = editorState.songTrimEnd - editorState.songTrimStart;
    duration.textContent = formatTime(selected) + ' selected';
  }
}

function syncAudioWithVideo() {
  const video = editorState.videoElement;
  const audio = editorState.audioElement;
  
  if (!video || !audio) return;
  
  // Remove old listeners
  video.removeEventListener('play', handleVideoPlay);
  video.removeEventListener('pause', handleVideoPause);
  video.removeEventListener('seeking', handleVideoSeek);
  
  audio.muted = false;
  video.muted = true;
  
  video.addEventListener('play', handleVideoPlay);
  video.addEventListener('pause', handleVideoPause);
  video.addEventListener('seeking', handleVideoSeek);
}

function handleVideoPlay() {
  const audio = editorState.audioElement;
  if (audio) {
    audio.currentTime = editorState.songTrimStart;
    audio.play();
  }
}

function handleVideoPause() {
  const audio = editorState.audioElement;
  if (audio) {
    audio.pause();
  }
}

function handleVideoSeek() {
  const video = editorState.videoElement;
  const audio = editorState.audioElement;
  
  if (!video || !audio) return;
  
  const videoProgress = (video.currentTime - editorState.trimStart) / (editorState.trimEnd - editorState.trimStart);
  const audioDuration = editorState.songTrimEnd - editorState.songTrimStart;
  audio.currentTime = editorState.songTrimStart + (videoProgress * audioDuration);
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
      .select('id, title, audio_file_url, cover_art_url, artist_id')
      .eq('artist_id', editorState.artistId)
      .not('audio_file_url', 'is', null)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (!songs || songs.length === 0) {
      listElement.innerHTML = '<p class="empty-state">No songs uploaded yet</p>';
      return;
    }
    
    // Get artist names
    const { data: artist } = await supabase
      .from('artists')
      .select('user_id, users(display_name)')
      .eq('id', editorState.artistId)
      .single();
    
    const artistName = artist?.users?.display_name || 'Artist';
    
    listElement.innerHTML = songs.map(song => `
      <div class="song-item" data-song-id="${song.id}" data-audio-url="${song.audio_file_url}" data-cover="${song.cover_art_url}" data-artist="${artistName}">
        <img src="${song.cover_art_url}" alt="${song.title}">
        <div class="song-info">
          <p class="song-title">${song.title}</p>
          <p class="song-artist">${artistName}</p>
        </div>
        <button class="btn-select-song">Select</button>
      </div>
    `).join('');
    
    document.querySelectorAll('.btn-select-song').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const songItem = e.target.closest('.song-item');
        if (songItem) {
          selectSongForVideo({
            id: songItem.dataset.songId,
            title: songItem.querySelector('.song-title').textContent,
            artist_name: songItem.dataset.artist,
            audio_file_url: songItem.dataset.audioUrl,
            cover_art_url: songItem.dataset.cover
          });
        }
      });
    });
    
  } catch (error) {
    console.error('Error loading songs:', error);
    listElement.innerHTML = '<p class="error-state">Error loading songs</p>';
  }
}

function selectSongForVideo(song) {
  editorState.selectedSongId = song.id;
  editorState.selectedSong = song;
  
  updateMusicCard(song);
  closeMusicDrawer();
  
  console.log('✅ Song selected:', song.title);
}

function handleUseOriginalAudio() {
  editorState.selectedSongId = null;
  editorState.selectedSong = null;
  editorState.audioElement = null;
  
  updateMusicCard(null);
  
  const previewAudio = document.getElementById('preview-audio');
  if (previewAudio) {
    previewAudio.pause();
    previewAudio.src = '';
  }
  
  const video = editorState.videoElement;
  if (video) video.muted = false;
  
  closeMusicDrawer();
  console.log('✅ Using original audio');
}

function openMusicDrawer() {
  const drawer = document.getElementById('music-drawer');
  if (drawer) {
    drawer.classList.add('active');
    loadArtistSongs();
  }
}

function closeMusicDrawer() {
  const drawer = document.getElementById('music-drawer');
  if (drawer) {
    drawer.classList.remove('active');
  }
}

// ============================================
// NAVIGATION TO FINALIZE
// ============================================

function handleNextToFinalize() {
  // Pause and stop playback
  const video = editorState.videoElement;
  const audio = editorState.audioElement;
  
  if (video) video.pause();
  if (audio) audio.pause();
  
  // Store edit data for finalize screen
  const editData = {
    trimStart: editorState.trimStart,
    trimEnd: editorState.trimEnd,
    selectedSongId: editorState.selectedSongId,
    selectedSong: editorState.selectedSong,
    songTrimStart: editorState.songTrimStart || 0,
    songTrimEnd: editorState.songTrimEnd || 0,
    thumbnails: editorState.videoThumbnails,
    videoDuration: editorState.videoDuration
  };
  
  sessionStorage.setItem('turntbl_edit_data', JSON.stringify(editData));
  
  // Store video blob
  if (editorState.videoBlob) {
    const blobUrl = URL.createObjectURL(editorState.videoBlob);
    sessionStorage.setItem('turntbl_video_blob_url', blobUrl);
  } else if (editorState.videoFile) {
    const blobUrl = URL.createObjectURL(editorState.videoFile);
    sessionStorage.setItem('turntbl_video_blob_url', blobUrl);
  }
  
  window.location.href = '/finalize.html';
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
    const reviewVideo = document.getElementById('review-video');
    if (reviewVideo) {
      reviewVideo.pause();
      reviewVideo.src = '';
    }
    
    const editVideo = document.getElementById('edit-video');
    if (editVideo) {
      editVideo.pause();
      editVideo.src = '';
    }
    
    stopCamera();
    window.location.href = editorState.returnUrl;
  }
}
