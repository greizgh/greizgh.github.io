const updater = {
  favSize: 32,
  // Number of milliseconds between two refresh
  // Below 100ms, the browser can't keep up
  refresh: 100,
  setup: function() {
    this.video = document.getElementById('video');
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.favSize;
    this.canvas.height = this.favSize;
    this.ctx = this.canvas.getContext('2d');
    this.favicon = document.getElementById('favicon');
    this.video.addEventListener('play', () => { this.callback(); });
    this.video.addEventListener('canplay', () => { this.setVideoSize(); });
    // Black background
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.favSize, this.favSize);
  },

  setVideoSize: function() {
    this.vidWidth = this.favSize;
    // Handle 16/9
    this.vidHeight = Math.floor(this.video.videoHeight / this.video.videoWidth * this.vidWidth);
    // Vertically center the video
    this.vOffset = Math.round((this.favSize - this.vidHeight) / 2);
  },

  callback: function() {
    if (this.video.paused || this.video.ended) {
      return;
    }
    this.handleFrame();
    setTimeout(() => { this.callback(); }, this.refresh);
  },

  handleFrame: function() {
    this.ctx.drawImage(this.video, 0, this.vOffset, this.vidWidth, this.vidHeight);
    this.favicon.href = this.canvas.toDataURL('image/png');
  },
};

document.addEventListener('DOMContentLoaded', () => {
  const favicon = document.getElementById('favicon');
  const favSize = 16;

  const canvas = document.createElement('canvas');
  canvas.width = favSize;
  canvas.height = favSize;

  const context = canvas.getContext('2d');

  context.fillStyle = '#ff0000';
  context.fillRect(0, 0, favSize, favSize);

  favicon.href = canvas.toDataURL('image/png');

  updater.setup();
});
