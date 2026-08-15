document.addEventListener('DOMContentLoaded', () => {
  const stage = document.getElementById('space-stage');
  const toggle = document.getElementById('sound-toggle');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (stage && !reduceMotion) {
    stage.addEventListener('pointermove', (event) => {
      const { left, top, width, height } = stage.getBoundingClientRect();
      const rotateY = ((event.clientX - left) / width - .5) * 8;
      const rotateX = ((event.clientY - top) / height - .5) * -8;
      stage.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    });
    stage.addEventListener('pointerleave', () => { stage.style.transform = ''; });
  }
  toggle?.addEventListener('click', () => {
    const active = document.body.classList.toggle('orbit-active');
    toggle.setAttribute('aria-pressed', String(active));
    toggle.innerHTML = active ? '<b>❚❚</b> Pause the orbit' : '<b>▶</b> Experience the orbit';
  });
});
