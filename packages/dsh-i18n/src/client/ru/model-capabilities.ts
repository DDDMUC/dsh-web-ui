/**
 * ru copy for dsh-model-capabilities (namespace `model-caps`).
 * Mirrors the zh key set of packages/dsh-model-capabilities/src/client/locales.ts;
 * scripts/i18n-audit.mjs verifies coverage and placeholder parity.
 * @module @linxin666/dsh-i18n/client/ru/model-capabilities
 */

export const ru: Record<string, string> = {
  'caps.title': 'Возможности моделей',
  'caps.hint': 'Объявляйте ввод изображений и уровни рассуждений для каждой модели каталога; сохранение пишет в документ настроек и применяется сразу.',
  'caps.loading': 'Загрузка возможностей моделей…',
  'caps.loadFailed': 'Не удалось загрузить: {error}',
  'caps.reload': 'Обновить',
  'caps.empty': 'Для этого провайдера пока нет редактируемого каталога моделей. Сначала добавьте строки моделей в каталог выше, затем вернитесь сюда, чтобы объявить возможности каждой модели.',
  'caps.readOnly': 'Документ настроек доступен только для чтения; изменения отключены.',
  'caps.model.count': 'моделей: {n}',
  'caps.model.expand': 'Развернуть возможности модели',
  'caps.model.collapse': 'Свернуть возможности модели',
  'caps.model.image': 'Ввод изображений',
  'caps.model.image.hint': 'DSH предлагает этому модели вложения-изображения только когда флажок установлен.',
  'caps.model.image.inherit': 'Не объявлено (по умолчанию только текст)',
  'caps.model.efforts': 'Уровни рассуждений',
  'caps.efforts.inherit': 'Не объявлять',
  'caps.efforts.none': 'Без рассуждений',
  'caps.efforts.levels': 'Объявить уровни',
  'caps.efforts.inheritHint': 'Следует встроенному каталогу; у объявленной вручную модели наследовать нечего — это равносильно отсутствию рассуждений.',
  'caps.efforts.noneHint': 'Объявить модель нереассонирующей (reasoningEfforts: false); селектор моделей перестанет предлагать уровни мышления.',
  'caps.efforts.levelsHint': 'Отметьте поддерживаемые моделью уровни и укажите значение, которое реально уйдёт в запросе.',
  'caps.wire.label': 'Значение',
  'caps.wire.placeholder': 'значение параметра запроса',
  'caps.wire.offHint': 'off может остаться пустым: «поддерживается, но при выборе ничего не отправляется».',
  'caps.preset.common': 'Подставить обычные low / medium / high',
  'caps.summary.image': 'изображения',
  'caps.summary.textOnly': 'только текст',
  'caps.summary.noReasoning': 'без рассуждений',
  'caps.summary.efforts': 'рассуждения: {levels}',
  'caps.save': 'Сохранить',
  'caps.saving': 'Сохранение…',
  'caps.discard': 'Сбросить',
  'caps.dirty': 'Есть несохранённые изменения',
  'caps.saved': 'Сохранено',
  'caps.conflict': 'Конфигурация изменена в другом окне; перечитано — повторите попытку.',
  'caps.failed': 'Не удалось сохранить: {error}',
  'caps.invalid.wire': 'Уровень {level} требует непустое значение для отправки.',
  'caps.invalid.offOnly': 'Объявите хотя бы один уровень кроме off или выберите «Без рассуждений».',
}
