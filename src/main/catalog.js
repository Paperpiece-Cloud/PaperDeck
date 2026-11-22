'use strict';

// Shared widget metadata. Exposed to both windows instead of being duplicated in
// each renderer, so the settings catalogue always matches what the display can draw.
const WIDGET_CATALOG = [
  {
    kind: 'cpu', name: 'CPU', description: '处理器使用率、频率、温度与封装功率',
    category: '性能', icon: 'cpu', minW: 2, minH: 1, defaultW: 3, defaultH: 2,
  },
  {
    kind: 'gpu', name: 'GPU', description: '显卡使用率、显存、温度与实时功率',
    category: '性能', icon: 'gpu', minW: 2, minH: 1, defaultW: 3, defaultH: 2,
  },
  {
    kind: 'ram', name: '内存', description: '物理内存占用与可用容量',
    category: '性能', icon: 'ram', minW: 2, minH: 1, defaultW: 3, defaultH: 2,
  },
  {
    kind: 'power', name: '功率', description: 'CPU / GPU 实时功耗分别显示',
    category: '性能', icon: 'bolt', minW: 2, minH: 1, defaultW: 3, defaultH: 2,
  },
  {
    kind: 'temps', name: '温度', description: 'CPU、GPU 与热区温度监控',
    category: '性能', icon: 'thermometer', minW: 2, minH: 2, defaultW: 2, defaultH: 2,
  },
  {
    kind: 'media', name: '媒体播放器', description: '专辑封面、歌曲信息、播放控制与进度',
    category: '媒体', icon: 'music', minW: 4, minH: 3, defaultW: 6, defaultH: 4,
  },
  {
    kind: 'lyrics', name: '歌词', description: '逐行歌词、翻译与苹果音乐风格聚焦',
    category: '媒体', icon: 'lyrics', minW: 4, minH: 2, defaultW: 6, defaultH: 4,
  },
  {
    kind: 'quick', name: '控制中心', description: 'Wi-Fi、蓝牙、音量、亮度与系统开关',
    category: '系统', icon: 'sliders', minW: 2, minH: 2, defaultW: 2, defaultH: 4,
  },
  {
    kind: 'network', name: '网络', description: '实时上下行速度、连接与 IP 地址',
    category: '系统', icon: 'wifi', minW: 2, minH: 1, defaultW: 2, defaultH: 2,
  },
  {
    kind: 'storage', name: '存储', description: '磁盘容量与读写活动',
    category: '系统', icon: 'drive', minW: 2, minH: 1, defaultW: 2, defaultH: 2,
  },
  {
    kind: 'clock', name: '时钟', description: '时间、日期与星期',
    category: '系统', icon: 'clock', minW: 2, minH: 1, defaultW: 2, defaultH: 2,
  },
  {
    kind: 'system', name: '系统状态', description: '电池、运行时间、音量与亮度',
    category: '系统', icon: 'battery', minW: 2, minH: 1, defaultW: 2, defaultH: 2,
  },
  {
    kind: 'bluetooth', name: '蓝牙电量', description: '已连接蓝牙设备与 Windows 上报的电量',
    category: '系统', icon: 'bluetooth', minW: 2, minH: 2, defaultW: 2, defaultH: 2,
  },
  {
    kind: 'shortcuts', name: '应用捷径', description: '一键启动常用应用和系统页面',
    category: '系统', icon: 'grid', minW: 2, minH: 2, defaultW: 3, defaultH: 2,
  },
];

const QUICK_ACTIONS = [
  { id: 'wifi', label: '网络', icon: 'wifi', description: '打开 Windows 网络面板' },
  { id: 'bluetooth', label: '蓝牙', icon: 'bluetooth', description: '打开 Windows 蓝牙设置' },
  { id: 'volume', label: '音量', icon: 'volume', description: '调节输出音量' },
  { id: 'brightness', label: '亮度', icon: 'sun', description: '调节显示器亮度' },
  { id: 'mute', label: '静音', icon: 'mute', description: '切换系统静音' },
  { id: 'screenshot', label: '截图', icon: 'camera', description: '截取当前副屏' },
  { id: 'lock', label: '锁定', icon: 'lock', description: '锁定 Windows' },
  { id: 'sleep', label: '睡眠', icon: 'moon', description: '让电脑进入睡眠' },
  { id: 'taskmgr', label: '任务管理器', icon: 'activity', description: '打开任务管理器' },
  { id: 'settings', label: '设置', icon: 'gear', description: '打开 PaperDeck 设置' },
  { id: 'playpause', label: '播放/暂停', icon: 'play', description: '控制当前媒体会话' },
  { id: 'next', label: '下一首', icon: 'next', description: '切换到下一首' },
  { id: 'prev', label: '上一首', icon: 'prev', description: '切换到上一首' },
];

const PROVIDERS = [
  { id: 'lrclib', name: 'LRCLIB', description: '全球曲库，适合 Apple Music 与欧美歌曲', icon: 'cloud' },
  { id: 'netease', name: '网易云音乐', description: '中文曲库，支持翻译歌词', icon: 'netease' },
  { id: 'qq', name: 'QQ 音乐', description: '中文曲库，支持 QQ 音乐歌词', icon: 'qq' },
  { id: 'kugou', name: '酷狗音乐', description: '中文曲库，支持酷狗歌词', icon: 'kugou' },
];

module.exports = { WIDGET_CATALOG, QUICK_ACTIONS, PROVIDERS };
