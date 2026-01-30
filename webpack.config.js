const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

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
            filename: isProduction ? '[name].js' : '[name].js',
            clean: true
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    use: 'ts-loader',
                    exclude: /node_modules/
                }
            ]
        },
        resolve: {
            extensions: ['.ts', '.js']
        },
        plugins: [
            new CopyPlugin({
                patterns: [
                    { from: 'public/manifest.json', to: 'manifest.json' },
                    { from: 'src/popup/popup.html', to: 'popup.html' },
                    { from: 'src/popup/popup.css', to: 'popup.css' },
                    { from: 'src/assets/styles', to: 'assets/styles' },
                    { from: 'src/assets/icons', to: 'assets/icons' } // Copies icons if they exist
                ]
            })
        ],
        devtool: isProduction ? false : 'inline-source-map',
        optimization: {
            minimize: isProduction
        }
    };
};
