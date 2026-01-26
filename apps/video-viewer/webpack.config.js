const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const webpack = require('webpack');
const Dotenv = require('dotenv-webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: 'development',
    devtool: 'source-map',
    entry: './apps/video-viewer/renderer.js',
    target: 'web',
    output: {
        filename: 'renderer.js',
        path: path.resolve(__dirname, '../../app_build/video-viewer'),
        clean: true,
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                use: [MiniCssExtractPlugin.loader, 'css-loader'],
            },
        ],
    },
    resolve: {
        extensions: ['.js'],
        alias: {
            'three/src': 'three',
        },
    },
    plugins: [
        new MiniCssExtractPlugin(),
        new HtmlWebpackPlugin({
            title: 'Sitrec Video Viewer',
            template: path.resolve(__dirname, 'index.html'),
        }),
        new webpack.ProvidePlugin({
            Buffer: ['buffer', 'Buffer'],
        }),
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify('production'),
            'process.env.BUILD_VERSION_STRING': JSON.stringify('Video Viewer 1.0'),
            'process.env.BUILD_VERSION_NUMBER': JSON.stringify('1.0.0'),
            'process.env.DOCKER_BUILD': JSON.stringify(false),
            'process.env.SETTINGS_COOKIES_ENABLED': JSON.stringify('false'),
            'process.env.SETTINGS_SERVER_ENABLED': JSON.stringify('false'),
            'process.env.SETTINGS_DB_ENABLED': JSON.stringify('false'),
            'process.env.SAVE_TO_SERVER': JSON.stringify('false'),
            'process.env.SAVE_TO_S3': JSON.stringify('false'),
            'process.env.SAVE_TO_LOCAL': JSON.stringify('false'),
            'process.env.IS_SERVERLESS_BUILD': JSON.stringify('true'),
            'process.env.LOCALHOST': JSON.stringify('http://localhost:3000'),
            'process.env.SITREC_TRACK_STATS': JSON.stringify('false'),
            'process.env.BANNER_ACTIVE': JSON.stringify('false'),
            'CAN_REQUIRE_CONTEXT': JSON.stringify(false),
            'INCLUDE_IWER_EMULATOR': JSON.stringify(false),
        }),
        new CopyWebpackPlugin({
            patterns: [
                { from: 'data/images/video-sprites-40px-5x3-dark.png', to: 'data/images/' },
            ],
        }),
    ],
    optimization: {
        minimize: false,
        usedExports: true,
        sideEffects: true,
    },
    experiments: {
        topLevelAwait: true,
        asyncWebAssembly: true,
    },
    externals: {
        'node:fs': 'commonjs2 fs',
    },
    performance: {
        hints: 'warning',
        maxAssetSize: 5000000,
        maxEntrypointSize: 5000000,
    },
};
