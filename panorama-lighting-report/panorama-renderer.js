/**
 * [INPUT]: 依赖本地 Three.js r180、浏览器WebGL与四张等距柱状投影图
 * [OUTPUT]: 对外提供 PanoramaRenderer4，同视角双栏/四栏与任意双图滑动对比
 * [POS]: 全景光影报告的独立渲染器，沿用参考对比页球面投影并扩展双栏，无生成与网络调用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
(function (global) {
  'use strict';
  var DEG = Math.PI / 180;
  var BACKGROUND = '#182126';
  var vertex = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
  var fragment = [
    'uniform sampler2D uMapA; uniform sampler2D uMapB; uniform sampler2D uMapC; uniform sampler2D uMapD;',
    'uniform bool uHasA; uniform bool uHasB; uniform bool uHasC; uniform bool uHasD; uniform int uMode; uniform int uSide;',
    'uniform int uPairA; uniform int uPairB; uniform float uYaw; uniform float uPitch; uniform float uTanHalfFov; uniform float uAspect; uniform float uWipe; uniform vec3 uEmpty; varying vec2 vUv;',
    'const float PI=3.141592653589793;',
    'void main(){ vec2 screen=vUv*2.0-1.0; vec3 ray=normalize(vec3(screen.x*uTanHalfFov,screen.y*uTanHalfFov/uAspect,1.0));',
    'float cp=cos(uPitch),sp=sin(uPitch); ray=vec3(ray.x,cp*ray.y+sp*ray.z,cp*ray.z-sp*ray.y);',
    'float cy=cos(uYaw),sy=sin(uYaw); ray=vec3(cy*ray.x+sy*ray.z,ray.y,cy*ray.z-sy*ray.x);',
    'vec2 uv=vec2(atan(ray.x,ray.z)/(2.0*PI)+0.5,0.5-asin(clamp(ray.y,-1.0,1.0))/PI);',
    'int selected=uSide; if(uMode==1) selected=vUv.x<uWipe?uPairA:uPairB; vec3 color=uEmpty;',
    'if(selected==0 && uHasA) color=texture2D(uMapA,uv).rgb; if(selected==1 && uHasB) color=texture2D(uMapB,uv).rgb;',
    'if(selected==2 && uHasC) color=texture2D(uMapC,uv).rgb; if(selected==3 && uHasD) color=texture2D(uMapD,uv).rgb;',
    'gl_FragColor=vec4(color,1.0);',
    '#include <colorspace_fragment>',
    '}'
  ].join('\n');
  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
  class PanoramaRenderer4 {
    constructor(canvas,onError){
      this.canvas=canvas; this.onError=typeof onError==='function'?onError:function(){}; this.disposed=false; this.contextLost=false; this.frame=null; this.width=0; this.height=0; this.pixelRatio=0;
      this.images=[null,null,null,null]; this.textures=[null,null,null,null]; this.state={yaw:0,pitch:0,fov:80,mode:'columns',wipe:.5,pairA:0,pairB:1,columns:2};
      this._lost=e=>{e.preventDefault();this.contextLost=true;if(this.frame!==null)global.cancelAnimationFrame(this.frame);this.frame=null;this._report(new Error('全景渲染已暂停，显卡上下文丢失。'));};
      this._restored=()=>{this.contextLost=false;this.textures.forEach(t=>{if(t)t.needsUpdate=true;});this.requestRender();};
      try{var THREE=global.THREE;if(!THREE)throw new Error('Three.js 渲染库未加载。');
        this.renderer=new THREE.WebGLRenderer({canvas:canvas,alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'high-performance'}); this.renderer.outputColorSpace=THREE.SRGBColorSpace; this.renderer.toneMapping=THREE.NoToneMapping; this.renderer.autoClear=false; this.renderer.setClearColor(new THREE.Color(BACKGROUND),1);
        this.emptyTexture=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);this.emptyTexture.needsUpdate=true;
        this.uniforms={uMapA:{value:this.emptyTexture},uMapB:{value:this.emptyTexture},uMapC:{value:this.emptyTexture},uMapD:{value:this.emptyTexture},uHasA:{value:false},uHasB:{value:false},uHasC:{value:false},uHasD:{value:false},uMode:{value:0},uSide:{value:0},uPairA:{value:0},uPairB:{value:1},uYaw:{value:0},uPitch:{value:0},uTanHalfFov:{value:Math.tan(40*DEG)},uAspect:{value:1},uWipe:{value:.5},uEmpty:{value:new THREE.Color(BACKGROUND)}};
        this.material=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:vertex,fragmentShader:fragment,depthTest:false,depthWrite:false,toneMapped:false,precision:'highp'}); this.geometry=new THREE.PlaneGeometry(2,2); this.scene=new THREE.Scene(); this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1); this.mesh=new THREE.Mesh(this.geometry,this.material); this.mesh.frustumCulled=false; this.scene.add(this.mesh);
        canvas.addEventListener('webglcontextlost',this._lost);canvas.addEventListener('webglcontextrestored',this._restored);this.resize();
      }catch(error){this._report(error);this.dispose();}
    }
    _report(e){this.onError(e instanceof Error?e:new Error(String(e)));}
    _texture(image){if(!image)return null;var THREE=global.THREE,w=image.naturalWidth||image.width,h=image.naturalHeight||image.height;if(!w||!h||image.complete===false)throw new Error('全景图尚未加载完成。');var t=new THREE.Texture(image);t.colorSpace=THREE.SRGBColorSpace;t.flipY=false;t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.ClampToEdgeWrapping;t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;}
    setImages(images){if(this.disposed||!this.renderer)return;images=Array.isArray(images)?images:[null,null,null,null];var next=this.textures.slice();try{for(var i=0;i<4;i++)if(images[i]!==this.images[i])next[i]=this._texture(images[i]);}catch(e){next.forEach((t,i)=>{if(t&&t!==this.textures[i])t.dispose();});this._report(e);return;}for(var j=0;j<4;j++)if(this.textures[j]&&next[j]!==this.textures[j])this.textures[j].dispose();this.images=images.slice(0,4);this.textures=next;['A','B','C','D'].forEach((n,i)=>{this.uniforms['uMap'+n].value=next[i]||this.emptyTexture;this.uniforms['uHas'+n].value=Boolean(next[i]);});this.requestRender();}
    setView(view){if(this.disposed||!this.renderer||!view)return;if(Number.isFinite(view.yaw))this.state.yaw=((view.yaw+180)%360+360)%360-180;if(Number.isFinite(view.pitch))this.state.pitch=clamp(view.pitch,-90,90);if(Number.isFinite(view.fov))this.state.fov=clamp(view.fov,25,110);if(view.mode==='columns'||view.mode==='wipe')this.state.mode=view.mode;if(Number.isFinite(view.wipe))this.state.wipe=clamp(view.wipe,0,1);if(Number.isInteger(view.pairA))this.state.pairA=clamp(view.pairA,0,3);if(Number.isInteger(view.pairB))this.state.pairB=clamp(view.pairB,0,3);if(view.columns===2||view.columns===4)this.state.columns=view.columns;this.requestRender();}
    resize(){if(this.disposed||!this.renderer)return;var r=this.canvas.getBoundingClientRect(),w=Math.max(1,Math.round(r.width)),h=Math.max(1,Math.round(r.height)),p=clamp(global.devicePixelRatio||1,1,2);if(w!==this.width||h!==this.height||p!==this.pixelRatio){this.width=w;this.height=h;this.pixelRatio=p;this.renderer.setPixelRatio(p);this.renderer.setSize(w,h,false);}this.requestRender();}
    requestRender(){if(this.disposed||!this.renderer||this.contextLost||this.frame!==null)return;this.frame=global.requestAnimationFrame(()=>{this.frame=null;if(this.disposed||this.contextLost)return;try{this._render();}catch(e){this._report(e);}});}
    viewport(x,w,side){if(w<=0)return;this.uniforms.uAspect.value=w/this.height;this.uniforms.uSide.value=side;this.renderer.setViewport(x,0,w,this.height);this.renderer.setScissor(x,0,w,this.height);this.renderer.render(this.scene,this.camera);}
    _render(){var u=this.uniforms;u.uYaw.value=this.state.yaw*DEG;u.uPitch.value=this.state.pitch*DEG;u.uTanHalfFov.value=Math.tan(this.state.fov*DEG/2);u.uMode.value=this.state.mode==='wipe'?1:0;u.uWipe.value=this.state.wipe;u.uPairA.value=this.state.pairA;u.uPairB.value=this.state.pairB;this.renderer.setScissorTest(false);this.renderer.setViewport(0,0,this.width,this.height);this.renderer.clear(true,true,false);this.renderer.setScissorTest(true);if(this.state.mode==='wipe'){this.viewport(0,this.width,0);}else{var count=this.state.columns,bw=Math.floor(this.width*this.pixelRatio),base=Math.floor(bw/count),offset=0;for(var i=0;i<count;i++){var width=(i===count-1?bw-base*(count-1):base)/this.pixelRatio;this.viewport(offset,width,i);offset+=width;}}this.renderer.setScissorTest(false);}
    dispose(){if(this.disposed)return;this.disposed=true;if(this.frame!==null)global.cancelAnimationFrame(this.frame);if(this.canvas){this.canvas.removeEventListener('webglcontextlost',this._lost);this.canvas.removeEventListener('webglcontextrestored',this._restored);}this.textures.forEach(t=>{if(t)t.dispose();});if(this.emptyTexture)this.emptyTexture.dispose();if(this.geometry)this.geometry.dispose();if(this.material)this.material.dispose();if(this.scene)this.scene.clear();if(this.renderer)this.renderer.dispose();this.renderer=null;}
  }
  global.PanoramaRenderer4=PanoramaRenderer4;
})(window);
