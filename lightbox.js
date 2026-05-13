const overlay = document.getElementById('lightbox');
const imgEl = overlay.querySelector('.lightbox-image');
const titleEl = overlay.querySelector('.lightbox-title');
const counterEl = overlay.querySelector('.lightbox-counter');
const prevBtn = overlay.querySelector('.lightbox-prev');
const nextBtn = overlay.querySelector('.lightbox-next');
const closeBtn = overlay.querySelector('.lightbox-close');

let location = null;
let index = 0;

function render() {
  if (!location) return;
  const photos = location.photos;
  imgEl.src = photos[index];
  titleEl.textContent = location.name;
  counterEl.textContent = `${index + 1} / ${photos.length}`;
  prevBtn.disabled = index === 0;
  nextBtn.disabled = index === photos.length - 1;
}

export function open(loc) {
  location = loc;
  index = 0;
  render();
  overlay.classList.add('open');
  document.addEventListener('keydown', onKey);
}

export function close() {
  overlay.classList.remove('open');
  document.removeEventListener('keydown', onKey);
  imgEl.src = '';
  location = null;
}

function next() {
  if (location && index < location.photos.length - 1) {
    index++;
    render();
  }
}

function prev() {
  if (location && index > 0) {
    index--;
    render();
  }
}

function onKey(e) {
  if (e.key === 'Escape') close();
  else if (e.key === 'ArrowLeft') prev();
  else if (e.key === 'ArrowRight') next();
}

prevBtn.addEventListener('click', prev);
nextBtn.addEventListener('click', next);
closeBtn.addEventListener('click', close);
overlay.addEventListener('click', (e) => {
  if (e.target === overlay) close();
});
