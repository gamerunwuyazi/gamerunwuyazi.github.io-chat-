const { defineConfig } = require('@vue/cli-service')
module.exports = defineConfig({
  transpileDependencies: true,
  outputDir: 'docs',
  chainWebpack: config => {
    config.plugin('html').tap(args => {
      args[0].title = '简易版聊天室'
      return args
    })
  }
})
