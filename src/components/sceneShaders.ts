// Fragment shaders for the two "living light" room themes. Written for this app: an aurora made of noise-driven
// curtains with a sharp lower edge and tall fading rays, and sunlit shallow water with caustics and light shafts.
const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 r; uniform float t;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x), mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++) { v += a*noise(p); p = p*2.03 + 11.7; a *= .5; } return v; }
`;

export const AURORA = HEAD + `
vec3 curtain(vec2 p, float mid, float seed, float baseY, float slope, float amp, float speed, float tall){
  float x = p.x*1.1 + seed*17.;
  // the lower edge crosses the sky at a slant, wanders and folds back on itself
  float base = baseY + slope*(p.x - mid) + amp*(fbm(vec2(x*.55 + t*speed, seed*3.))-.5)*2.4 + .045*sin(x*2.7 + t*speed*8. + seed*5.);
  float h = p.y - base;
  float height = tall*(.45 + 1.1*fbm(vec2(x*.9 - t*speed*.8, seed+4.)));
  float k = clamp(h/height, 0., 1.);
  // fine vertical rays that shimmer sideways
  float xr = x + h*.08;
  float rays = .55*noise(vec2(xr*64., t*.4 + seed)) + .45*noise(vec2(xr*17. + t*.1, seed*7.));
  rays = .12 + 1.9*rays*rays*rays;
  // the curtain brightens and thins out along its length
  float along = smoothstep(.3, .66, fbm(vec2(x*.8 - t*speed*1.6, seed*9.)));
  float body = smoothstep(-.005, .004, h) * pow(1.-k, 1.5);
  float edge = exp(-abs(h)*85.);
  float I = (body*rays*1.25 + edge*.5) * (.1 + 1.25*along);
  vec3 col = mix(vec3(.16, 1., .42), vec3(.1, .95, .7), smoothstep(.05, .35, k));
  col = mix(col, vec3(.5, .32, 1.)*1.7, smoothstep(.3, .62, k));
  col = mix(col, vec3(1., .25, .62)*2., smoothstep(.6, .95, k));
  return col*I;
}
void main(){
  vec2 uv = gl_FragCoord.xy/r; float asp = r.x/r.y; vec2 p = vec2(uv.x*asp, uv.y);
  vec3 sky = mix(vec3(.11, .185, .39), vec3(.04, .065, .2), smoothstep(0., 1., uv.y));
  sky += vec3(.03, .14, .12)*exp(-uv.y*3.5);
  vec2 sp = p*70.; vec2 cell = floor(sp); float sh = hash(cell);
  float star = step(.982, sh) * smoothstep(.3, 0., length(fract(sp)-.5)) * (.55 + .45*sin(t*(1. + sh*3.) + sh*50.));
  float mid = asp*.5;
  vec3 a = curtain(p, mid, 1., .27, .13, .13, .030, .66)
         + curtain(p, mid, 2., .58, -.12, .12, .023, .46)*.8
         + curtain(p, mid, 3., .44, .26, .10, .018, .36)*.4;
  a = 1. - exp(-a*1.3);
  float glow = dot(a, vec3(.33));
  vec3 col = sky + star*(1.-clamp(glow*2.5, 0., 1.)) + a + vec3(.02, .08, .06)*glow;
  gl_FragColor = vec4(col, 1.);
}`;

export const SEA = HEAD + `
float caus(vec2 p){
  vec2 q = p + .4*vec2(fbm(p*1.2 + t*.11), fbm(p*1.2 - t*.09 + 7.));
  float a = abs(sin(q.x*3.1 + fbm(q*2. + t*.21)*4.2));
  float b = abs(sin(q.y*3.3 + fbm(q*2.2 - t*.17 + 3.)*4.2));
  float c = abs(sin((q.x+q.y)*2.3 + fbm(q*1.7 + t*.14 + 9.)*4.2));
  return pow(1. - min(min(a, b), c), 10.);
}
void main(){
  vec2 uv = gl_FragCoord.xy/r; float asp = r.x/r.y; vec2 p = vec2(uv.x*asp, uv.y);
  vec3 top = vec3(.88, .975, 1.), mid = vec3(.70, .92, .98), bot = vec3(.42, .81, .93);
  vec3 col = mix(bot, mid, smoothstep(0., .5, uv.y)); col = mix(col, top, smoothstep(.45, 1., uv.y));
  // shafts of sunlight fanning down from above the surface
  vec2 d = p - vec2(asp*.38, 1.6); float ang = atan(d.x, -d.y);
  float shaft = fbm(vec2(ang*11. + t*.04, t*.07));
  shaft = smoothstep(.42, .8, shaft) * (.2 + .8*uv.y);
  col += vec3(1.)*shaft*.2;
  // moving light net
  float c = caus(p*3.) + .5*caus(p*5.6 + 3.);
  col += vec3(1., 1., .96)*c*(.07 + .13*(1.-uv.y));
  // rippling surface glare along the very top
  col += vec3(1.)*smoothstep(.9, 1., uv.y)*(.12 + .2*noise(vec2(p.x*9. + t*.6, t*.4)));
  gl_FragColor = vec4(min(col, vec3(1.)), 1.);
}`;
