/**
 * Full-screen textured quad shader
 */

export const GreyscaleShader = {

    uniforms: {

        'tDiffuse': { value: null },
        'opacity': { value: 1.0 },
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

           // Convert linear RT data to sRGB for perceptual greyscale weights
           vec4 color = sRGBTransferOETF(texture2D(tDiffuse, vUv));

            float grey = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
            gl_FragColor = vec4(vec3(grey), opacity);

            // Convert back to linear for the render target
            gl_FragColor = sRGBTransferEOTF(gl_FragColor);

		}`

};

