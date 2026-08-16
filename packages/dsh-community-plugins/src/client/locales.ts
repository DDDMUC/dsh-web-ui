/**
 * The community-plugins locale dictionaries for the index card.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'settings.title': '社区插件',
  'settings.description': '社区贡献者开发与维护的插件，链接指向作者自己的仓库。',
  'settings.enabled': '启用社区插件索引',
  'settings.enabledHint': '关闭后隐藏索引列表，可在这里重新启用。',
  'settings.inherit': '继承',
  'settings.on': '开',
  'settings.off': '关',
  'settings.overridden': '已覆盖',
  'settings.reset': '恢复默认',
  'settings.notExposed': '当前 DSH 版本未向设置页暴露本插件的配置命名空间，表单不可用。可编辑 ~/.dsh/settings.yaml 直接配置，或为 dsh-host-apiproxy 的 WEB_SETTINGS_NAMESPACES 白名单补充本命名空间后重启。',
  'settings.readOnly': '当前部署的设置只读。',
  'settings.expand': '展开设置',
  'settings.collapse': '收起设置',
  'settings.save': '保存',
  'settings.saving': '保存中…',
  'settings.discard': '放弃',
  'settings.unsaved': '未保存',
  'settings.saveFailed': '部署未接受这些值，已保留供你修改。',
  'settings.invalidNumber': '请输入数字，留空则使用默认值。',
  'author': '作者',
  'repository': '仓库',
  'empty': '暂无社区插件登记。',
  'off': '社区插件索引已关闭。',
  'notice': '条目由贡献者自行登记，与 dsh-web-ui 的发布内容无关；使用前请自行评估。',
} satisfies Record<string, string>

/** Key union for this namespace. */
export type CommunityPluginKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'settings.title': 'Community Plugins',
  'settings.description': "Plugins developed and maintained by community contributors, linking to each author's own repository.",
  'settings.enabled': 'Enable the community plugin index',
  'settings.enabledHint': 'When off, the index list is hidden; re-enable it here.',
  'settings.inherit': 'Inherit',
  'settings.on': 'On',
  'settings.off': 'Off',
  'settings.overridden': 'Overridden',
  'settings.reset': 'Reset to default',
  'settings.notExposed': "This DSH version does not expose this plugin's settings namespace to the configuration page, so the form is unavailable. Edit ~/.dsh/settings.yaml directly, or add the namespace to dsh-host-apiproxy's WEB_SETTINGS_NAMESPACES allowlist and restart.",
  'settings.readOnly': 'This deployment stores settings read-only.',
  'settings.expand': 'Show settings',
  'settings.collapse': 'Hide settings',
  'settings.save': 'Save',
  'settings.saving': 'Saving…',
  'settings.discard': 'Discard',
  'settings.unsaved': 'Unsaved',
  'settings.saveFailed': 'The deployment did not accept these values; they were left for you to correct.',
  'settings.invalidNumber': 'Enter a number, or leave blank to use the default.',
  'author': 'Author',
  'repository': 'Repository',
  'empty': 'No community plugins registered yet.',
  'off': 'The community plugin index is turned off.',
  'notice': 'Entries are contributed by their authors and are separate from dsh-web-ui releases; evaluate before use.',
} satisfies Record<CommunityPluginKey, string>
