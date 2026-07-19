import { merge } from 'webpack-merge';
import common from './webpack.common.js';

export default merge(common, {
  mode: 'development',
  devtool: 'eval-source-map',
  output: {
    filename: '[name].js',
  },
  devServer: {
    static: './dist',
    hot: true,
    open: true,
    port: 8080,
  },
});
