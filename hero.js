/* 3.141Hz: an original dot/character field and an XY trace. No dependencies. */
document.querySelectorAll('.hero').forEach(hero => {
  'use strict';
  const scene = hero.querySelector('.scene');
  const field = hero.querySelector('.field');
  const trace = hero.querySelector('.trace');
  const name = hero.querySelector('.name');
  const button = hero.querySelector('.motion');
  const readout = hero.querySelector('.signal output');
  const hint = hero.querySelector('.hint');
  if (!scene || !field || !trace || !name || !button || !readout || !hint) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const ink = trace.getContext('2d');
  // Role palette lives in site.css; both renderers consume the same colours.
  const styles = getComputedStyle(hero);
  const palette = Object.fromEntries(['bg', 'rule', 'tonic', 'laser'].map(role =>
    [role, styles.getPropertyValue(`--${role}`).trim()]));
  const rgb = hex => [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255);
  let gl, program, uniforms, fallback, lost = false;
  let width = 1, height = 1, scale = 1, bounds, titleBounds;
  let frame = 0, last = 0, elapsed = 0, lastDraw = 0, visible = true;
  let paused = reduced.matches, settled = false, ratio = Math.PI;
  let x = .68, y = .47, vx = 0, vy = 0, tx = x, ty = y, active = false;
  const vertexSource = 'attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}';
  const fragmentSource = `
    precision mediump float;
    uniform vec2 resolution, size, pointer;
    uniform float time, cell, reveal;
    uniform sampler2D atlas;
    uniform vec3 bgColor, ruleColor, fieldColor;
    void main(){
      vec2 pixel=vec2(gl_FragCoord.x/resolution.x,1.-gl_FragCoord.y/resolution.y)*size;
      vec2 id=floor(pixel/cell), local=fract(pixel/cell);
      vec2 uv=(id+.5)*cell/size;
      vec2 p=(uv-.5)*vec2(size.x/size.y,1.);
      float warp=2.3*sin(p.x*3.6+time*.14)+.9*cos(p.x*5.1-p.y*2.8-time*.1);
      float wave=pow(.5+.5*sin(p.y*11.+warp+time*.16),2.7);
      float detail=.5+.5*sin(p.x*8.-p.y*4.+time*.09);
      float envelope=exp(-dot(p*vec2(.66,1.38),p*vec2(.66,1.38))*1.8);
      float edge=smoothstep(0.,.16,uv.y)*(1.-smoothstep(.78,1.,uv.y));
      float light=clamp((wave*.85+detail*.13)*envelope*edge,0.,1.);
      float radius=.065+light*.35;
      float dotMask=1.-smoothstep(radius-.045,radius+.045,length(local-.5));
      float dist=length((uv-pointer)*vec2(size.x/size.y,1.));
      float lens=(1.-smoothstep(.10,.28,dist))*reveal;
      float glyph=floor(clamp(light*7.,0.,6.));
      float character=texture2D(atlas,vec2((glyph+local.x)/7.,local.y)).a;
      float marks=mix(dotMask,character,lens);
      vec3 pigment=mix(ruleColor,fieldColor,pow(light,1.7)*.85);
      gl_FragColor=vec4(mix(bgColor,pigment,marks*(.11+light*.79)),1.);
    }`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw new Error('Shader unavailable');
    }
    return shader;
  }

  function initializeGL() {
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Program unavailable');
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    uniforms = {};
    ['resolution','size','pointer','time','cell','reveal','atlas','bgColor','ruleColor','fieldColor'].forEach(key => {
      uniforms[key] = gl.getUniformLocation(program, key);
    });
    gl.uniform3fv(uniforms.bgColor, rgb(palette.bg));
    gl.uniform3fv(uniforms.ruleColor, rgb(palette.rule));
    gl.uniform3fv(uniforms.fieldColor, rgb(palette.tonic));
    const atlas = document.createElement('canvas');
    atlas.width = 112; atlas.height = 16;
    const context = atlas.getContext('2d');
    if (!context) throw new Error('Character atlas unavailable');
    context.fillStyle = palette.tonic;
    context.font = 'bold 14px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    [...'3.141hz'].forEach((letter, i) => context.fillText(letter, i * 16 + 8, 8));
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(uniforms.atlas, 0);
    field.classList.add('is-ready');
  }

  try {
    gl = field.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
    if (gl) initializeGL();
    else fallback = field.getContext('2d');
  } catch (_) {
    // A failed/blocked GPU keeps the CSS dot field and the independent 2D trace.
    lost = true;
    field.classList.remove('is-ready');
  }

  function drawField() {
    if (gl && !lost) {
      gl.viewport(0, 0, field.width, field.height);
      gl.uniform2f(uniforms.resolution, field.width, field.height);
      gl.uniform2f(uniforms.size, width, height);
      gl.uniform2f(uniforms.pointer, x, y);
      gl.uniform1f(uniforms.time, elapsed);
      gl.uniform1f(uniforms.cell, width < 600 ? 11 : 14);
      gl.uniform1f(uniforms.reveal, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } else if (fallback) {
      fallback.clearRect(0, 0, width, height);
      const cell = width < 600 ? 13 : 17;
      // The cheaper fallback uses the same wave envelope and seven characters.
      fallback.font = '12px monospace';
      fallback.textAlign = 'center';
      fallback.textBaseline = 'middle';
      for (let py = cell / 2; py < height; py += cell) {
        for (let px = cell / 2; px < width; px += cell) {
          const a = (px / width - .5) * width / height, b = py / height - .5;
          const warp = 2.3 * Math.sin(a * 3.6 + elapsed * .14) + .9 * Math.cos(a * 5.1 - b * 2.8 - elapsed * .1);
          const wave = Math.pow(.5 + .5 * Math.sin(b * 11 + warp + elapsed * .16), 2.7);
          const power = wave * Math.exp(-(a * a * .44 + b * b * 1.9) * 1.8) * Math.sin(Math.PI * py / height);
          fallback.globalAlpha = .12 + power * .7;
          fallback.fillStyle = power > .52 ? palette.tonic : palette.rule;
          if (Math.hypot((px - x * width) / height, py / height - y) < .2) {
            fallback.fillText('3.141hz'[Math.min(6, Math.floor(power * 7))], px, py);
          } else {
            const r = .5 + power * 2.8;
            fallback.fillRect(px - r, py - r, r * 2, r * 2);
          }
        }
      }
      fallback.globalAlpha = 1;
    }
  }

  function drawTrace() {
    if (!ink) return;
    ink.clearRect(0, 0, width, height);
    const mobile = width < 600;
    const cx = width * .5, cy = height * .49;
    const rx = width * (mobile ? .43 : .365), ry = height * (mobile ? .30 : .34);
    const phase = elapsed * .12;
    const path = new Path2D();
    const points = mobile ? 620 : 920;
    for (let i = 0; i <= points; i++) {
      const t = i / points * Math.PI * 3 + phase * .16;
      const px = cx + rx * Math.sin(t + phase * .27);
      const py = cy + ry * Math.sin(t * ratio + phase + (y - .47) * .55);
      if (i) path.lineTo(px, py); else path.moveTo(px, py);
    }
    ink.strokeStyle = palette.laser;
    ink.lineJoin = 'round'; ink.lineCap = 'round';
    // Wide low-energy passes form the glow, with no expensive blur filter.
    for (const [line, alpha] of [[9,.025],[4,.09],[1.15,.86]]) {
      ink.lineWidth = line; ink.globalAlpha = alpha; ink.stroke(path);
    }
    ink.globalAlpha = 1;
  }

  function draw() {
    drawField();
    drawTrace();
    if (titleBounds) {
      name.style.setProperty('--mx', `${(x * width - titleBounds.x).toFixed(1)}px`);
      name.style.setProperty('--my', `${(y * height - titleBounds.y).toFixed(1)}px`);
    }
    const text = ratio.toFixed(4);
    if (readout.textContent !== text) readout.textContent = text;
  }

  function running() { return !paused && visible && !document.hidden; }
  function tick(now) {
    frame = 0;
    if (!running()) return;
    // 30 fps on touch screens/fallback, 60 fps on a fine pointer. No catch-up on return.
    const interval = !fine.matches || fallback ? 1000 / 30 : 1000 / 60;
    if (now - lastDraw >= interval - 1) {
      const dt = last ? Math.min((now - last) / 1000, .04) : interval / 1000;
      last = now; lastDraw = now; elapsed += dt;
      // Critically damped movement: pointer impulses settle without a hard snap.
      vx += ((tx - x) * 65 - vx * 16) * dt;
      vy += ((ty - y) * 65 - vy * 16) * dt;
      x += vx * dt; y += vy * dt;
      const targetRatio = Math.PI + (active ? (x - .5) * .32 : 0);
      ratio += (targetRatio - ratio) * (1 - Math.exp(-dt * 4));
      draw();
    }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; last = 0; lastDraw = 0;
    if (running()) frame = requestAnimationFrame(tick);
  }
  function controls() {
    button.setAttribute('aria-pressed', String(paused));
    button.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
    button.textContent = paused ? 'Play motion' : 'Pause motion';
    hint.textContent = paused ? 'Still signal / ratio held' : fine.matches ? 'Move to detune · return to π' : 'Tap to detune';
  }
  function measure() {
    bounds = scene.getBoundingClientRect();
    width = bounds.width; height = bounds.height;
    const r = name.getBoundingClientRect();
    titleBounds = { x: r.left - bounds.left, y: r.top - bounds.top };
    scale = Math.min(devicePixelRatio || 1, width < 600 ? 1 : 1.25, Math.sqrt(1300000 / (width * height)));
    field.width = Math.max(1, Math.round(width * scale));
    field.height = Math.max(1, Math.round(height * scale));
    // Keep the laser crisp on retina displays while the shader stays inexpensive.
    const traceScale = Math.min(devicePixelRatio || 1, 2, Math.sqrt(2200000 / (width * height)));
    trace.width = Math.max(1, Math.round(width * traceScale));
    trace.height = Math.max(1, Math.round(height * traceScale));
    if (ink) ink.setTransform(traceScale, 0, 0, traceScale, 0, 0);
    if (fallback) fallback.setTransform(scale, 0, 0, scale, 0, 0);
    if (!settled) { settled = true; elapsed = 2.5; }
    draw();
  }

  function point(event) {
    if (paused || !visible) return;
    const rect = scene.getBoundingClientRect();
    tx = Math.max(.05, Math.min(.95, (event.clientX - rect.left) / width));
    ty = Math.max(.12, Math.min(.88, (event.clientY - rect.top) / height));
    active = true;
  }
  function release() { active = false; tx = .68; ty = .47; }
  // Touch only reacts to a tap: a swipe that starts on the hero is a scroll, and following it
  // made the trace jump to the finger and snap back when the browser took over the gesture.
  let tapTimer = 0;
  const mouseOnly = handler => event => { if (event.pointerType === 'mouse') handler(event); };
  scene.addEventListener('pointermove', mouseOnly(point), { passive: true });
  scene.addEventListener('pointerdown', mouseOnly(point), { passive: true });
  scene.addEventListener('pointerleave', mouseOnly(release));
  scene.addEventListener('click', event => {
    if (fine.matches) return;
    point(event);
    clearTimeout(tapTimer);
    tapTimer = setTimeout(release, 1400);
  });
  button.addEventListener('click', () => { paused = !paused; controls(); sync(); });
  const preferenceChanged = () => {
    paused = reduced.matches; release();
    if (paused) { x = tx; y = ty; vx = vy = 0; ratio = Math.PI; elapsed = 2.5; draw(); }
    controls(); sync();
  };
  if (reduced.addEventListener) reduced.addEventListener('change', preferenceChanged);
  else reduced.addListener(preferenceChanged);
  document.addEventListener('visibilitychange', () => { release(); sync(); });
  window.addEventListener('pagehide', () => { visible = false; sync(); });
  window.addEventListener('pageshow', () => { visible = hero.getBoundingClientRect().bottom > 0; sync(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (!visible) release();
      sync();
    }, { threshold: 0 }).observe(hero);
  } else {
    window.addEventListener('scroll', () => {
      const rect = hero.getBoundingClientRect();
      const next = rect.bottom > 0 && rect.top < innerHeight;
      if (next !== visible) { visible = next; sync(); }
    }, { passive: true });
  }
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(measure);
    observer.observe(scene);
    observer.observe(name);
  } else window.addEventListener('resize', measure, { passive: true });
  // A self-hosted font can swap after the first frame; realign the ASCII reveal.
  if (document.fonts) document.fonts.ready.then(measure);
  field.addEventListener('webglcontextlost', event => {
    event.preventDefault(); lost = true; field.classList.remove('is-ready');
  });
  field.addEventListener('webglcontextrestored', () => {
    try { initializeGL(); lost = false; measure(); } catch (_) { lost = true; }
  });
  button.hidden = !ink && !gl && !fallback;
  controls(); measure(); sync();
});
