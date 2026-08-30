import type { Translations } from './en';

/**
 * Bulgarian. Typed against the English shape, so removing or misspelling a key
 * fails `tsc` instead of rendering the raw key on a user's screen.
 */
const bg: Translations = {
  common: {
    save: 'Запази',
    cancel: 'Отказ',
    next: 'Напред',
    back: 'Назад',
    done: 'Готово',
    retry: 'Опитай отново',
    delete: 'Изтрий',
    edit: 'Редактирай',
    search: 'Търсене',
    loading: 'Зареждане…',
  },

  errors: {
    network_unavailable: 'Няма връзка. Провери интернета и опитай отново.',
    timeout: 'Отне твърде дълго. Опитай отново.',
    unauthorized: 'Влез в профила си, за да продължиш.',
    session_expired: 'Сесията изтече. Влез отново.',
    forbidden: 'Нямаш достъп до това.',
    not_found: 'Не намерихме това.',
    conflict: 'Вече е запазено.',
    validation_failed: 'Провери отбелязаните полета.',
    quota_exceeded: 'Изчерпа сканиранията си за днес.',
    premium_required: 'Това е Premium функция.',
    ai_unavailable: 'Не успяхме да анализираме храната. Опитай отново.',
    ai_invalid_response: 'Не успяхме да разчетем резултата. Опитай отново.',
    not_food: 'Това не прилича на храна. Опитай с друга снимка?',
    storage_failed: 'Не успяхме да качим снимката. Опитай отново.',
    server_error: 'Възникна проблем при нас. Опитай отново.',
    unknown: 'Нещо се обърка. Опитай отново.',
  },

  nutrition: {
    calories: 'Калории',
    protein: 'Протеин',
    carbs: 'Въглехидрати',
    fat: 'Мазнини',
    fiber: 'Фибри',
    water: 'Вода',
    eaten: 'приети',
    remaining: 'остават',
    over: 'над целта',
    estimateNotice: 'Тези стойности са ориентировъчни, не са медицински съвет.',
  },

  adjustments: {
    deficit_capped: 'Ограничихме дефицита, за да е безопасно.',
    surplus_capped: 'Ограничихме излишъка, за да е безопасно.',
    calorie_floor_applied: 'Повишихме целта до безопасен минимум.',
    rate_capped: 'Забавихме темпото, за да е безопасно.',
    protein_clamped: 'Коригирахме протеина спрямо калорийната цел.',
    fat_floor_applied: 'Повишихме мазнините до здравословен минимум.',
    carbs_floor_applied: 'Калорийната цел е твърде ниска за всички минимуми.',
  },

  validation: {
    age_below_minimum: 'Трябва да си на поне 18 години.',
    age_above_maximum: 'Въведи валидна възраст.',
    height_out_of_range: 'Въведи ръст между 120 и 250 см.',
    weight_out_of_range: 'Въведи тегло между 30 и 300 кг.',
    target_weight_out_of_range: 'Въведи целево тегло между 30 и 300 кг.',
    target_weight_below_healthy_bmi: 'Тази цел е под здравословното тегло за твоя ръст.',
    target_weight_wrong_direction: 'Целта не съответства на избраната посока.',
    deficit_goal_not_permitted_for_age: 'Целите за отслабване са достъпни от 18 г.',
    non_finite_input: 'Въведи число.',
  },
};

export default bg;
