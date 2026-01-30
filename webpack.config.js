const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
    const isProduction = argv.mode === 'production';

    return {
        entry: {
            'content-script': './src/content/content-script.ts',
            'service-worker': './src/background/service-worker.ts',
            'popup': './src/popup/popup.ts'
        },
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: '[name].js',
            clean: true
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    use: 'ts-loader',
                    exclude: /node_modules/
                },
                {
                    test: /\.css$/i,
                    use: [
                        MiniCssExtractPlugin.loader,
                        'css-loader',
                        'postcss-loader'
                    ],
                },
            ]
        },
        resolve: {
            extensions: ['.ts', '.js']
        },
        plugins: [
            new MiniCssExtractPlugin({
                filename: '[name].css',
            }),
            new CopyPlugin({
                patterns: [
                    { from: 'public/manifest.json', to: 'manifest.json' },
                    { from: 'src/popup/popup.html', to: 'popup.html' },
                    { from: 'src/assets/icons', to: 'assets/icons', noErrorOnMissing: true },
                    { from: 'src/assets/styles', to: 'assets/styles', noErrorOnMissing: true }
                ]
            })
        ],
        devtool: isProduction ? false : 'inline-source-map',
        optimization: {
            minimize: isProduction
        }
    };
};
