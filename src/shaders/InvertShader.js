/**
 * Full-screen textured quad shader
 */

export const InvertShader = {

    uniforms: {

        'tDiffuse': { value: null },

    },

    vertexShader: /* glsl */`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,

    fragmentShader: /* glsl */`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

            // Convert linear RT data to sRGB for perceptual inversion
			gl_FragColor = sRGBTransferOETF(texture2D( tDiffuse, vUv ));
            gl_FragColor.r = 1.0 - gl_FragColor.r;
            gl_FragColor.g = 1.0 - gl_FragColor.g;
            gl_FragColor.b = 1.0 - gl_FragColor.b;

            // Convert back to linear for the render target
            gl_FragColor = sRGBTransferEOTF(gl_FragColor);

		}`

};

