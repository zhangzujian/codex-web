type StatsigGateEvaluation = {
  name: string;
  value: boolean;
  [key: string]: unknown;
};

type StatsigDynamicConfig = {
  name: string;
  value?: Record<string, unknown>;
  get?: (key: string, fallback?: unknown) => unknown;
  [key: string]: unknown;
};

type StatsigLayer = {
  name: string;
  __value?: Record<string, unknown>;
  get?: (key: string, fallback?: unknown) => unknown;
  [key: string]: unknown;
};

export type StatsigOverrideAdapter = {
  getGateOverride: (
    evaluation: StatsigGateEvaluation,
    ...args: unknown[]
  ) => StatsigGateEvaluation | null;
  getDynamicConfigOverride: (
    config: StatsigDynamicConfig,
    ...args: unknown[]
  ) => StatsigDynamicConfig | null;
  getLayerOverride: (
    layer: StatsigLayer,
    ...args: unknown[]
  ) => StatsigLayer | null;
};

const I18N_DYNAMIC_CONFIG_NAME = "72216192";
const AUTOMATIONS_GATE_NAME = "3075919032";

function getI18nValue(value: Record<string, unknown> = {}) {
  return {
    ...value,
    enable_i18n: true,
    locale_source: value.locale_source ?? "IDE",
  };
}

function readOverrideValue(
  value: Record<string, unknown>,
  key: string,
  fallback?: unknown,
) {
  const configValue = value[key];
  return configValue == null ? (fallback ?? null) : configValue;
}

export function createStatsigOverrideAdapter(): StatsigOverrideAdapter {
  return {
    getGateOverride(evaluation) {
      if (evaluation.name === AUTOMATIONS_GATE_NAME) {
        return {
          ...evaluation,
          value: true,
        };
      }

      if (evaluation.name === "2929582856") {
        // codex_app_sunset
        return {
          ...evaluation,
          value: false,
        };
      }

      return null;
    },
    getDynamicConfigOverride(config) {
      if (config.name !== I18N_DYNAMIC_CONFIG_NAME) {
        return null;
      }

      const value = getI18nValue(config.value);

      return {
        ...config,
        value,
        get(key, fallback) {
          return readOverrideValue(value, key, fallback);
        },
      };
    },
    getLayerOverride(layer) {
      if (layer.name !== I18N_DYNAMIC_CONFIG_NAME) {
        return null;
      }

      const value = getI18nValue(layer.__value);

      return {
        ...layer,
        __value: value,
        get(key, fallback) {
          return readOverrideValue(value, key, fallback);
        },
      };
    },
  };
}
