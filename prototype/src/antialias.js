// Shimmer control. Import before any material compiles.
//
// Fine bump textures (fabric weave, wood grain, plastic noise) are drawn with
// screen-space derivatives. Once one pixel covers several texels of the bump map,
// neighbouring pixels land on unrelated bumps and the highlights sparkle as the
// camera moves (specular aliasing). Like the usual fixes (Toksvig, LEAN), detail
// smaller than a pixel is faded out here instead of being sampled at random.
import * as THREE from 'three';

const chunk = THREE.ShaderChunk.bumpmap_pars_fragment;
const from = 'return vec2( dBx, dBy );';
if (!chunk.includes(from)) throw new Error('bumpmap chunk changed; update antialias.js');
THREE.ShaderChunk.bumpmap_pars_fragment = chunk.replace(
  from,
  `vec2 texels = vec2( textureSize( bumpMap, 0 ) );
		float footprint = max( length( dSTdx * texels ), length( dSTdy * texels ) );
		return vec2( dBx, dBy ) * ( 1.0 - smoothstep( 0.7, 2.5, footprint ) );`,
);
