/**
 * [INPUT]: 依赖双层 Canvas2D、球面容器、原图节点与可插值机位
 * [OUTPUT]: createCameraScene 提供分层缓存的前后半球网、居中原图遮挡、透视机身/镜头/LCD与视锥的按需绘制
 * [POS]: public 摄影机球的纯绘制层，由 camera-sphere 调度，不管理输入或生成任务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

const rad = value => value * Math.PI / 180;
const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, n) => a.map(v => v * n);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const norm = a => mul(a, 1 / (Math.hypot(...a) || 1));
const orbit = (a, e, d = 1) => [Math.sin(rad(a)) * Math.cos(rad(e)) * d, Math.sin(rad(e)) * d, Math.cos(rad(a)) * Math.cos(rad(e)) * d];
const view = ([x, y, z]) => {
  const yaw = rad(20), tilt = rad(16);
  const vx = x * Math.cos(yaw) + z * Math.sin(yaw), vz = -x * Math.sin(yaw) + z * Math.cos(yaw);
  return [vx, y * Math.cos(tilt) - vz * Math.sin(tilt), y * Math.sin(tilt) + vz * Math.cos(tilt)];
};

export function createCameraScene(stage, { light = false } = {}) {
  const canvas = stage.querySelector('[data-scene]');
  const front = stage.querySelector('.cs-camera-front');
  const ctx = canvas.getContext('2d'), top = front.getContext('2d');
  const grid = document.createElement('canvas'), gridCtx = grid.getContext('2d');
  const frontGrid = document.createElement('canvas'), frontGridCtx = frontGrid.getContext('2d');
  const photo = stage.querySelector('[data-photo]'), handle = stage.querySelector('.cs-camera-handle');
  let w = 0, h = 0, dpr = 1, radius = 1, cx = 0, cy = 0;
  const project = p => {
    const q = view(p), perspective = 5.5 / (5.5 - q[2]);
    return [cx + q[0] * radius * perspective, cy - q[1] * radius * perspective, q[2]];
  };
  function path(context, points, close = false) {
    context.beginPath();
    points.forEach((p, i) => i ? context.lineTo(p[0], p[1]) : context.moveTo(p[0], p[1]));
    if (close) context.closePath();
  }
  function wire(context, points, color, width = .7) {
    path(context, points.map(project));
    context.strokeStyle = color;
    context.lineWidth = width;
    context.stroke();
  }
  function rebuildGrid() {
    gridCtx.clearRect(0, 0, w, h);
    frontGridCtx.clearRect(0, 0, w, h);
    // -------- 前后半球分别缓存，原图夹在其间；尺寸或DPR变化才重建 --------
    for (const frontHalf of [false, true]) {
      const context = frontHalf ? frontGridCtx : gridCtx;
      context.globalAlpha = frontHalf ? .72 : 1;
      const stroke = light ? (frontHalf ? '#c4c6cb' : '#e4e5e8') : (frontHalf ? '#56585e' : '#35373d');
      const segment = (a, b, equator = false) => {
        if ((view(a)[2] + view(b)[2] >= 0) !== frontHalf) return;
        wire(context, [a, b], stroke, equator ? 1 : .65);
      };
      for (let lat = -60; lat <= 60; lat += 30) {
        for (let a = 0; a < 360; a += 4) segment(orbit(a, lat), orbit(a + 4, lat), lat === 0);
      }
      for (let lon = 0; lon < 180; lon += 30) {
        const p = a => [Math.sin(rad(a)) * Math.cos(rad(lon)), Math.cos(rad(a)), Math.sin(rad(a)) * Math.sin(rad(lon))];
        for (let a = 0; a < 360; a += 4) segment(p(a), p(a + 4));
      }
    }
  }
  function resize() {
    const nw = stage.clientWidth, nh = stage.clientHeight, nd = Math.min(window.devicePixelRatio || 1, 2);
    if (!nw || !nh) return false;
    if (nw === w && nh === h && nd === dpr) return true;
    w = nw; h = nh; dpr = nd;
    radius = Math.min(w * .32, h * .32, 220); cx = w / 2; cy = h * (light ? .5 : .52);
    for (const [layer, context] of [[canvas, ctx], [front, top], [grid, gridCtx], [frontGrid, frontGridCtx]]) {
      layer.width = Math.round(w * dpr); layer.height = Math.round(h * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    rebuildGrid();
    return true;
  }
  function drawCamera(context, center, pose, sourceImage) {
    const forward = norm(mul(center, -1)), right = norm(cross(forward, [0, 1, 0])), up = norm(cross(right, forward));
    const size = .8 * Math.min(1.2, Math.max(.85, 165 / radius));
    const local = (x, y, z) => add(center, mul(add(mul(right, x), add(mul(up, y), mul(forward, z))), size));
    const faces = [];
    const face = (points, color, options = {}) => faces.push({ points: points.map(p => local(...p)), color, ...options });
    const box = (x0, y0, z0, x1, y1, z1, color) => {
      const a = [x0,y0,z0], b = [x1,y0,z0], c = [x1,y1,z0], d = [x0,y1,z0];
      const e = [x0,y0,z1], f = [x1,y0,z1], g = [x1,y1,z1], j = [x0,y1,z1];
      for (const p of [[d,c,b,a],[e,f,g,j],[a,b,f,e],[j,g,c,d],[a,e,j,d],[b,c,g,f]]) face(p, color);
    };
    const bevelBody = () => {
      const outline=[[-.18,-.125],[.18,-.125],[.2,-.105],[.2,.085],[.18,.105],[-.18,.105],[-.2,.085],[-.2,-.105]];
      const back=outline.map(([x,y])=>[x,y,-.1]), front=outline.map(([x,y])=>[x,y,.055]);
      face([...back].reverse(),[58,62,68]);face(front,[55,59,64]);
      for(let i=0;i<8;i++)face([back[i],back[(i+1)%8],front[(i+1)%8],front[i]],[82,88,96]);
    };
    const cylinder = (x, y, z0, z1, r, color, steps = 28) => {
      const ring = z => Array.from({ length: steps }, (_, i) => [x + r * Math.cos(i / steps * Math.PI * 2), y + r * Math.sin(i / steps * Math.PI * 2), z]);
      const a = ring(z0), b = ring(z1);
      face([...a].reverse(), color); face(b, color);
      for (let i = 0; i < steps; i++) face([a[i], a[(i+1)%steps], b[(i+1)%steps], b[i]], color, { edge: false });
    };
    // -------- 银色顶盖、皮纹机身、握柄、取景器与多节镜筒 --------
    bevelBody();
    box(-.205, .103, -.105, .205, .143, .06, [168,174,181]);
    box(-.205, -.141, -.104, .205, -.119, .06, [100,106,113]);
    box(.13, -.12, -.11, .222, .105, .09, [40,43,47]);
    box(-.064, .14, -.07, .064, .184, .03, [120,128,135]);
    box(-.044, .146, -.098, .044, .177, -.071, [27,31,36]);
    box(-.135, .143, -.045, -.084, .167, .02, [87,93,100]);
    box(.13, .143, -.02, .18, .164, .025, [202,206,211]);
    cylinder(-.025, -.015, .052, .073, .099, [133,140,148]);
    cylinder(-.025, -.015, .073, .146, .093, [35,40,46]);
    cylinder(-.025, -.015, .146, .165, .098, [100,106,114]);
    cylinder(-.025, -.015, .165, .23, .089, [41,46,51]);
    cylinder(-.025, -.015, .23, .245, .093, [135,142,151]);
    cylinder(-.025, -.015, .246, .249, .077, [14,26,34]);
    cylinder(-.025, -.015, .25, .252, .052, [27,58,66]);
    // -------- LCD采用当前参考图的真实纹理，机背按键与刻线独立建模 --------
    box(-.165, -.092, -.113, .095, .075, -.105, [13,17,22]);
    face([[-.149,.061,-.114],[.079,.061,-.114],[.079,-.078,-.114],[-.149,-.078,-.114]], [38,48,54], { image: sourceImage, unlit: true });
    cylinder(.151, -.036, -.116, -.113, .022, [142,148,155], 16);
    for (const y of [.06, .018, -.091]) cylinder(.15, y, -.116, -.113, .009, [174,180,186], 12);
    for (let x = -.18; x < .2; x += .016) {
      face([[x,-.11,.056],[x+.003,-.11,.056],[x+.003,.092,.056],[x,.092,.056]], [70,74,78], { edge:false });
    }
    const lightDirection = norm([-.4,.8,1]);
    faces.sort((a,b) => a.points.reduce((n,p)=>n+view(p)[2],0)/a.points.length - b.points.reduce((n,p)=>n+view(p)[2],0)/b.points.length);
    for (const f of faces) {
      const points = f.points.map(project);
      const normal = norm(cross(add(f.points[1],mul(f.points[0],-1)), add(f.points[2],mul(f.points[0],-1))));
      const brightness = f.unlit ? 1 : .64 + .4 * Math.max(0, dot(view(normal), lightDirection));
      path(context, points, true);
      context.fillStyle = `rgb(${f.color.map(c=>Math.min(255,Math.round(c*brightness))).join(',')})`;
      context.fill();
      if (f.edge !== false) {
        context.strokeStyle = 'rgba(218,224,229,.36)'; context.lineWidth = .55; context.stroke();
      }
      if (f.image?.complete && f.image.naturalWidth) texture(context, f.image, points);
    }
    // -------- 非装饰高光只附着镜片与机身材质 --------
    if (view(forward)[2] > .1) {
      const p = project(local(-.047,.008,.254));
      context.beginPath(); context.ellipse(p[0],p[1],2,3,-.4,0,Math.PI*2);
      context.fillStyle = 'rgba(197,227,233,.72)'; context.fill();
    }
    return project(center);
  }
  function texture(context, image, points) {
    // -------- 两片仿射三角形贴图，无额外纹理请求 --------
    const iw = image.naturalWidth, ih = image.naturalHeight;
    for (const [a,b,c,uv] of [[0,1,3,[[0,0],[iw,0],[0,ih]]],[2,3,1,[[iw,ih],[0,ih],[iw,0]]]]) {
      const p=points[a], q=points[b], r=points[c];
      context.save(); path(context,[p,q,r],true);context.clip();
      const sx=(q[0]-p[0])/(uv[1][0]-uv[0][0] || 1), sy=(q[1]-p[1])/(uv[1][0]-uv[0][0] || 1);
      const tx=(r[0]-p[0])/(uv[2][1]-uv[0][1] || 1), ty=(r[1]-p[1])/(uv[2][1]-uv[0][1] || 1);
      context.transform(sx,sy,tx,ty,p[0]-sx*uv[0][0]-tx*uv[0][1],p[1]-sy*uv[0][0]-ty*uv[0][1]);
      context.drawImage(image,0,0);context.restore();
    }
  }
  function cone(center) {
    const p = project(center), pw = photo.offsetWidth / 2, ph = photo.offsetHeight / 2;
    const points = [[cx-pw,cy-ph],[cx+pw,cy-ph],[cx+pw,cy+ph],[cx-pw,cy+ph]];
    const all = [p,...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const half = list => { const out=[]; for(const v of list){while(out.length>1&&turn(out.at(-2),out.at(-1),v)<=0)out.pop();out.push(v);} return out; };
    const hull=[...half(all).slice(0,-1),...half([...all].reverse()).slice(0,-1)];
    const gradient=ctx.createLinearGradient(p[0],p[1],cx,cy);
    gradient.addColorStop(0,light?'rgba(143,151,166,.28)':'rgba(255,255,255,.48)');
    gradient.addColorStop(1,light?'rgba(187,195,208,.04)':'rgba(255,255,255,.03)');
    path(ctx,hull,true);ctx.fillStyle=gradient;ctx.fill();
    ctx.strokeStyle=light?'rgba(137,147,163,.32)':'rgba(220,225,235,.30)';ctx.lineWidth=.7;ctx.stroke();
  }
  function draw(pose) {
    if (!resize()) return;
    ctx.clearRect(0,0,w,h);top.clearRect(0,0,w,h);
    ctx.drawImage(grid,0,0,w,h);
    top.drawImage(frontGrid,0,0,w,h);
    const center=orbit(pose.azimuth,pose.elevation,.88+pose.distance*.0028);
    const sourceImage=photo.querySelector('img');
    cone(center);
    const screen=drawCamera(view(center)[2]>=0?top:ctx,center,pose,sourceImage);
    handle.hidden=false;
    handle.style.transform=`translate3d(${screen[0]}px,${screen[1]}px,0) translate(-50%,-50%)`;
    handle.style.left='0';handle.style.top='0';
    stage.style.setProperty('--orbit-radius',`${radius}px`);
  }
  return { draw };
}
