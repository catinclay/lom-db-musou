import { merge } from 'webpack-merge';
import common from './webpack.common.js';

export default merge(common, {
  mode: 'production',
  devtool: 'source-map',
  output: {
    filename: '[name].[contenthash].js',
  },
  // Phaser 本來就是 1.3MB 等級的引擎，webpack 預設的 244KB 門檻對遊戲沒有意義。
  // 留著只會每次 build 都噴警告，淹掉真正該看的訊息。
  performance: {
    hints: false,
  },
  optimization: {
    splitChunks: {
      cacheGroups: {
        // Phaser 是 ~1MB+，切開讓遊戲碼的改動不會讓玩家重抓整個引擎。
        phaser: {
          test: /[\\/]node_modules[\\/]phaser[\\/]/,
          name: 'phaser',
          chunks: 'all',
        },
      },
    },
  },
});
