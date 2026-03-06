module.exports = {
  presets: [
    ['@vue/cli-plugin-babel/preset', {
      useBuiltIns: 'usage',
      corejs: 3,
      targets: {
        ios: '10'
      }
    }]
  ]
}
