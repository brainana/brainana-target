export const layerLimit = 4
export const firstDepthUnit = 12
export const depthEpsilon = 0.000002

export const peelFragment = `
uniform highp sampler2D previousDepth;
void main() {
  float previous = texelFetch(previousDepth, ivec2(gl_FragCoord.xy), 0).r;
  if (gl_FragCoord.z <= previous + ${depthEpsilon}) discard;
  shadeMesh();
}`

export const bandTest = `
uniform highp sampler2D anatomyDepth0;
uniform highp sampler2D anatomyDepth1;
uniform highp sampler2D anatomyDepth2;
uniform highp sampler2D anatomyDepth3;
uniform int depthCount;
uniform int meshBand;
bool insideDepthBand(float z, ivec2 pixel) {

  vec4 depths = vec4(
    texelFetch(anatomyDepth0, pixel, 0).r,
    texelFetch(anatomyDepth1, pixel, 0).r,
    texelFetch(anatomyDepth2, pixel, 0).r,
    texelFetch(anatomyDepth3, pixel, 0).r
  );
  float tolerance = ${depthEpsilon};
  if (meshBand == -1) {
    return z <= depths[0] + tolerance;
  } else if (meshBand < ${layerLimit}) {
    float nearer = depths[meshBand];
    float farther = meshBand + 1 < depthCount ? depths[meshBand + 1] : 1.0;
    return nearer != 1.0 && z > nearer + tolerance && z <= farther + tolerance;
  } else {
    float ownDepth = depths[meshBand - ${layerLimit}];
    return ownDepth != 1.0 && abs(z - ownDepth) <= tolerance;
  }
}
`
export const bandFragment = `${bandTest}
void main() {
  if (!insideDepthBand(gl_FragCoord.z, ivec2(gl_FragCoord.xy))) discard;
  shadeMesh();
}`
