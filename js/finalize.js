// js/finalize.js - COMPLETE FILE

import { supabase } from './config.js';

// ============================================
// STATE MANAGEMENT
// ============================================

const finalizeState = {
  videoBlobUrl: null,
  videoElement: null,
  trimStart: 0,
  trimEnd: 30,
  selectedSongId: null,
  selectedSong: null,
  songTrimStart: 0,
  songTrimEnd: 0,
  thumbnails: [],
  selectedThumbnailTime: 0,
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
  
  if (!finalizeState.token || !finalizeState.artistId) {
    window.location.href = '/';
    return;
  }
  
  loadEditData();
  setupEventListeners();
  initializeThumbnailSelector();
});

function loadEditData() {
  const editDataStr = sessionStorage.getItem('turntbl_edit_data');
  const videoBlobUrl = sessionStorage.getItem('turntbl_video_blob_url');
  
  if (!editDataStr || !videoBlobUrl) {
    alert('No video data found. Please start over.');
    window.location.href = '/editor.html';
    return;
  }
  
  try {
    const editData = JSON.parse(editDataStr);
    
    finalizeState.videoBlobUrl = videoBlobUrl;
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
  const video = document.createElement('video');
  video.src = finalizeState.videoBlobUrl;
  video.muted = true;
  video.crossOrigin = 'anonymous';
  video.style.display = 'none';
  document.body.appendChild(video);
  
  finalizeState.videoElement = video;
  
  video.addEventListener('loadedmetadata', () => {
    console.log('✅ Video loaded for thumbnail selection');
    
    const scrubber = document.getElementById('thumbnail-scrubber');
    if (scrubber) {
      scrubber.min = 0;
      scrubber.max = 100;
      scrubber.value = 0;
    }
    
    renderThumbnailStrip();
    
    finalizeState.selectedThumbnailTime = finalizeState.trimStart;
    updateThumbnailPreview(finalizeState.trimStart);
  });
}

function renderThumbnailStrip() {
  const container = document.getElementById('scrubber-thumbnails');
  if (!container || !finalizeState.thumbnails.length) return;
  
  container.innerHTML = '';
  
  const totalDuration = finalizeState.videoDuration;
  const trimDuration = finalizeState.trimEnd - finalizeState.trimStart;
  const startPercent = finalizeState.trimStart / totalDuration;
  const endPercent = finalizeState.trimEnd / totalDuration;
  
  const startIndex = Math.floor(startPercent * finalizeState.thumbnails.length);
  const endIndex = Math.ceil(endPercent * finalizeState.thumbnails.length);
  
  const relevantThumbnails = finalizeState.thumbnails.slice(startIndex, endIndex);
  
  relevantThumbnails.forEach((thumbnail, index) => {
    const img = document.createElement('img');
    img.src = thumbnail;
    img.className = 'scrubber-thumbnail';
    img.alt = `Frame ${index + 1}`;
    container.appendChild(img);
  });
}

function handleThumbnailScrub(e) {
  const percent = parseFloat(e.target.value) / 100;
  
  const trimDuration = finalizeState.trimEnd - finalizeState.trimStart;
  const time = finalizeState.trimStart + (percent * trimDuration);
  
  finalizeState.selectedThumbnailTime = time;
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
      const ctx = canvas.getContext('2d');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const displayWidth = Math.min(400, canvas.width);
      const displayHeight = (displayWidth / canvas.width) * canvas.height;
      canvas.style.width = displayWidth + 'px';
      canvas.style.height = displayHeight + 'px';
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const selectedCtx = selectedCanvas.getContext('2d');
      selectedCanvas.width = 120;
      selectedCanvas.height = (120 / canvas.width) * canvas.height;
      selectedCtx.drawImage(video, 0, 0, selectedCanvas.width, selectedCanvas.height);
      
      canvas.toBlob((blob) => {
        finalizeState.selectedThumbnailBlob = blob;
        console.log('✅ Thumbnail captured at', formatTime(time));
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
  if (!finalizeState.selectedThumbnailBlob) {
    alert('Please wait for thumbnail to load');
    return;
  }
  
  if (!confirm('Publish this video to Turntbl?')) return;
  
  showView('publishing-view');
  
  const statusElement = document.getElementById('publish-status');
  const progressElement = document.getElementById('publish-progress');
  
  try {
    // 1. Upload thumbnail
    if (statusElement) statusElement.textContent = 'Uploading thumbnail...';
    if (progressElement) progressElement.style.width = '20%';
    
    const thumbnailFileName = `${finalizeState.artistId}/${Date.now()}_thumbnail.jpg`;
    const { error: thumbError } = await supabase.storage
      .from('songs')
      .upload(thumbnailFileName, finalizeState.selectedThumbnailBlob);
    
    if (thumbError) throw thumbError;
    
    const { data: { publicUrl: thumbnailUrl } } = supabase.storage
      .from('songs')
      .getPublicUrl(thumbnailFileName);
    
    console.log('✅ Thumbnail uploaded:', thumbnailUrl);
    
    // 2. Upload video
    if (statusElement) statusElement.textContent = 'Uploading video...';
    if (progressElement) progressElement.style.width = '60%';
    
    const videoResponse = await fetch(finalizeState.videoBlobUrl);
    const videoBlob = await videoResponse.blob();
    
    const videoFileName = `${finalizeState.artistId}/${Date.now()}_promo.webm`;
    const { error: videoError } = await supabase.storage
      .from('songs')
      .upload(videoFileName, videoBlob);
    
    if (videoError) throw videoError;
    
    const { data: { publicUrl: videoUrl } } = supabase.storage
      .from('songs')
      .getPublicUrl(videoFileName);
    
    console.log('✅ Video uploaded:', videoUrl);
    
    // 3. Create discovery post (NOT song entry)
    if (statusElement) statusElement.textContent = 'Publishing to discover feed...';
    if (progressElement) progressElement.style.width = '90%';
    
    const postData = {
      artist_id: finalizeState.artistId,
      video_url: videoUrl,
      linked_song_id: finalizeState.selectedSongId || null,
      caption: finalizeState.caption || null,
      created_at: new Date().toISOString()
    };
    
    console.log('📤 Publishing discovery post:', postData);
    
    const { data: discoveryPost, error: dbError } = await supabase
      .from('discovery_posts')
      .insert(postData)
      .select()
      .single();
    
    if (dbError) {
      console.error('Database error:', dbError);
      throw dbError;
    }
    
    console.log('✅ Discovery post created:', discoveryPost.id);
    
    // 4. Success!
    if (statusElement) statusElement.textContent = 'Success! Redirecting...';
    if (progressElement) progressElement.style.width = '100%';
    
    // Clean up
    sessionStorage.removeItem('turntbl_edit_data');
    sessionStorage.removeItem('turntbl_video_blob_url');
    
    setTimeout(() => {
      window.location.href = `${finalizeState.returnUrl}?published=true&video_id=${discoveryPost.id}`;
    }, 1000);
    
  } catch (error) {
    console.error('❌ Publish error:', error);
    alert(`Failed to publish: ${error.message}\n\nPlease try again or contact support.`);
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

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
