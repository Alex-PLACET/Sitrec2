/**
 * Full-screen textured quad shader
 */

export const CompressShader = {

    uniforms: {

        'tDiffuse': { value: null },
        'opacity': { value: 1.0 },
        'lower': { value: 0.1 },
        'upper': { value: 0.9 },


    },

    vertexShader: /* glsl */`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,

    fragmentShader: /* glsl */`

		uniform float opacity;
		uniform float lower;
        uniform float upper;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

            // Convert linear RT data to sRGB for range compression
			gl_FragColor = sRGBTransferOETF(texture2D( tDiffuse, vUv ));
                float span = upper - lower;
                gl_FragColor.r = lower + span * gl_FragColor.r;
                gl_FragColor.g = lower + span * gl_FragColor.g;
                gl_FragColor.b = lower + span * gl_FragColor.b;

            // Convert back to linear for the render target
            gl_FragColor = sRGBTransferEOTF(gl_FragColor);

		}`

};

