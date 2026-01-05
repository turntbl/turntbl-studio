// js/finalize.js

import { supabase } from './config.js';

// ============================================
// STATE MANAGEMENT
// ============================================

const finalizeState = {
  videoFile: null,
  videoBlob: null,
  videoElement: null,
  trimStart: 0,
  trimEnd: 30,
  selectedSongId: null,
  selectedSong: null,
  songTrimStart: 0,
  songTrimEnd: 0,
  thumbnails: [],
  selectedThumbnailIndex: 0,
  selectedThumbnailBlob: null,
  caption: '',
  token: sessionStorage.getItem('turntbl_token'),
  artistId: sessionStorage.getItem('turntbl_artist_id'),
  returnUrl: sessionStorage.getItem('turntbl_return_url')
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ Finalize screen initialized');
  
  // Load data from edit screen
  loadEditData();
  
  // Setup event listeners
  setupEventListeners();
  
  // Initialize thumbnail selector
  initializeThumbnailSelector();
});

function loadEditData() {
  const editDataStr = sessionStorage.getItem('turntbl_edit_data');
  
  if (!editDataStr) {
    alert('No video data found. Please start over.');
    window.location.href = '/editor.html';
    return;
  }
  
  try {
    const editData = JSON.parse(editDataStr);
    
    finalizeState.videoBlob = editData.videoBlob;
    finalizeState.trimStart = editData.trimStart;
    finalizeState.trimEnd = editData.trimEnd;
    finalizeState.selectedSongId = editData.selectedSongId;
    finalizeState.selectedSong = editData.selectedSong;
    finalizeState.songTrimStart = editData.songTrimStart;
    finalizeState.songTrimEnd = editData.songTrimEnd;
    finalizeState.thumbnails = editData.thumbnails || [];
    finalizeState.videoDuration = editData.videoDuration;
    
    console.log('✅ Edit data loaded');
  } catch (error) {
    console.error('Error loading edit data:', error);
    alert('Error loading video data. Please start over.');
    window.location.href = '/editor.html';
  }
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
  document.getElementById('back-to-edit-btn')?.addEventListener('click', handleBackToEdit);
  document.getElementById('thumbnail-scrubber')?.addEventListener('input', handleThumbnailScrub);
  document.getElementById('caption-input')?.addEventListener('input', handleCaptionInput);
  document.getElementById('publish-btn')?.addEventListener('click', handlePublish);
}

function handleBackToEdit() {
  window.history.back();
}

// ============================================
// THUMBNAIL SELECTION
// ============================================

function initializeThumbnailSelector() {
  // Create hidden video element for thumbnail capture
  const video = document.createElement('video');
  video.src = finalizeState.videoBlob;
  video.muted = true;
  video.style.display = 'none';
  document.body.appendChild(video);
  
  finalizeState.videoElement = video;
  
  video.addEventListener('loadedmetadata', () => {
    // Set scrubber range based on trimmed video
    const scrubber = document.getElementById('thumbnail-scrubber');
    if (scrubber) {
      scrubber.min = finalizeState.trimStart;
      scrubber.max = finalizeState.trimEnd;
      scrubber.value = finalizeState.trimStart;
    }
    
    // Render thumbnail preview strip
    renderThumbnailStrip();
    
    // Show initial thumbnail
    updateThumbnailPreview(finalizeState.trimStart);
  });
}

function renderThumbnailStrip() {
  const container = document.getElementById('scrubber-thumbnails');
  if (!container || !finalizeState.thumbnails.length) return;
  
  container.innerHTML = '';
  
  finalizeState.thumbnails.forEach((thumbnail, index) => {
    const img = document.createElement('img');
    img.src = thumbnail;
    img.className = 'scrubber-thumbnail';
    img.alt = `Frame ${index + 1}`;
    container.appendChild(img);
  });
}

function handleThumbnailScrub(e) {
  const time = parseFloat(e.target.value);
  updateThumbnailPreview(time);
}

async function updateThumbnailPreview(time) {
  const video = finalizeState.videoElement;
  const canvas = document.getElementById('thumbnail-canvas');
  const selectedCanvas = document.getElementById('selected-thumbnail-canvas');
  
  if (!video || !canvas || !selectedCanvas) return;
  
  video.currentTime = time;
  
  await new Promise(resolve => {
    video.onseeked = () => {
      // Draw to main canvas
      const ctx = canvas.getContext('2d');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Scale for display (16:9 aspect ratio, max 400px wide)
      const displayWidth = Math.min(400, canvas.width);
      const displayHeight = (displayWidth / canvas.width) * canvas.height;
      canvas.style.width = displayWidth + 'px';
      canvas.style.height = displayHeight + 'px';
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Draw to selected thumbnail preview (smaller)
      const selectedCtx = selectedCanvas.getContext('2d');
      selectedCanvas.width = 120;
      selectedCanvas.height = (120 / canvas.width) * canvas.height;
      selectedCtx.drawImage(video, 0, 0, selectedCanvas.width, selectedCanvas.height);
      
      // Store as blob for upload
      canvas.toBlob((blob) => {
        finalizeState.selectedThumbnailBlob = blob;
      }, 'image/jpeg', 0.9);
      
      resolve();
    };
  });
}

// ============================================
// CAPTION INPUT
// ============================================

function handleCaptionInput(e) {
  const caption = e.target.value;
  const counter = document.getElementById('caption-count');
  
  if (counter) {
    counter.textContent = caption.length;
  }
  
  finalizeState.caption = caption;
}

// ============================================
// PUBLISH
// ============================================

async function handlePublish() {
  if (!confirm('Publish this video to Turntbl?')) return;
  
  // Show publishing view
  showView('publishing-view');
  
  const statusElement = document.getElementById('publish-status');
  if (statusElement) statusElement.textContent = 'Preparing video...';
  
  try {
    // 1. Upload thumbnail
    if (statusElement) statusElement.textContent = 'Uploading thumbnail...';
    
    const thumbnailFileName = `${finalizeState.artistId}/${Date.now()}_thumbnail.jpg`;
    const { error: thumbError } = await supabase.storage
      .from('songs')
      .upload(thumbnailFileName, finalizeState.selectedThumbnailBlob);
    
    if (thumbError) throw thumbError;
    
    const { data: { publicUrl: thumbnailUrl } } = supabase.storage
      .from('songs')
      .getPublicUrl(thumbnailFileName);
    
    // 2. Upload video
    if (statusElement) statusElement.textContent = 'Uploading video...';
    
    // Fetch the video blob
    const videoResponse = await fetch(finalizeState.videoBlob);
    const videoBlob = await videoResponse.blob();
    
    const videoFileName = `${finalizeState.artistId}/${Date.now()}_promo.mp4`;
    const { error: videoError } = await supabase.storage
      .from('songs')
      .upload(videoFileName, videoBlob);
    
    if (videoError) throw videoError;
    
    const { data: { publicUrl: videoUrl } } = supabase.storage
      .from('songs')
      .getPublicUrl(videoFileName);
    
    // 3. Create song entry in database
    if (statusElement) statusElement.textContent = 'Creating song entry...';
    
    const { data: song, error: dbError } = await supabase
      .from('songs')
      .insert({
        artist_id: finalizeState.artistId,
        title: 'Untitled', // Will be updated when they add full song details
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        caption: finalizeState.caption,
        music_source_song_id: finalizeState.selectedSongId,
        music_start_time: finalizeState.songTrimStart,
        duration: finalizeState.trimEnd - finalizeState.trimStart,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (dbError) throw dbError;
    
    // 4. Success! Redirect
    if (statusElement) statusElement.textContent = 'Success! Redirecting...';
    
    // Clean up sessionStorage
    sessionStorage.removeItem('turntbl_edit_data');
    
    setTimeout(() => {
      // Redirect to getturntbl.com discover feed or song page
      window.location.href = `${finalizeState.returnUrl}?published=true&song_id=${song.id}`;
    }, 1000);
    
  } catch (error) {
    console.error('❌ Publish error:', error);
    alert(`Failed to publish: ${error.message}`);
    showView('finalize-view');
  }
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
