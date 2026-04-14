import { FC, useState, useMemo, useCallback } from 'react';
import {
  STConnectionProfileSelect,
  STPresetSelect,
  STButton,
  STTextarea,
  PresetItem,
} from 'sillytavern-utils-lib/components/react';
import { ExtensionSettingsManager } from 'sillytavern-utils-lib';
import {
  ExtensionSettings,
  Schema,
  DEFAULT_PROMPT_JSON,
  DEFAULT_SCHEMA_VALUE,
  DEFAULT_SCHEMA_HTML,
  defaultSettings,
  EXTENSION_KEY,
} from '../config.js';
import { AutoModeOptions } from 'sillytavern-utils-lib/types/translate';
import { useForceUpdate } from '../hooks/useForceUpdate.js';

// Initialize the settings manager once, outside the component
export const settingsManager = new ExtensionSettingsManager<ExtensionSettings>(EXTENSION_KEY, defaultSettings);

export const WTrackerLiteSettings: FC = () => {
  const forceUpdate = useForceUpdate();
  const settings = settingsManager.getSettings();
  const [schemaText, setSchemaText] = useState(
    JSON.stringify(settings.schemaPresets[settings.schemaPreset]?.value, null, 2) ?? '',
  );

  const updateAndRefresh = useCallback(
    (updater: (currentSettings: ExtensionSettings) => void) => {
      const currentSettings = settingsManager.getSettings();
      updater(currentSettings);
      settingsManager.saveSettings();
      forceUpdate();
    },
    [forceUpdate],
  );

  // Memoized data for the schema preset dropdown
  const schemaPresetItems = useMemo((): PresetItem[] => {
    return Object.entries(settings.schemaPresets).map(([value, preset]) => ({
      value,
      label: preset.name,
    }));
  }, [settings.schemaPresets]);

  // Handler for when a new schema preset is selected
  const handleSchemaPresetChange = (newValue?: string) => {
    const newPresetKey = newValue ?? 'default';
    const newPreset = settings.schemaPresets[newPresetKey];
    if (newPreset) {
      updateAndRefresh((settings) => {
        settings.schemaPreset = newPresetKey;
      });
      setSchemaText(JSON.stringify(newPreset.value, null, 2));
    }
  };

  // Handler for when the list of presets is modified (created, renamed, deleted)
  const handleSchemaPresetsListChange = (newItems: PresetItem[]) => {
    updateAndRefresh((s) => {
      const newPresets: Record<string, Schema> = {};
      newItems.forEach((item) => {
        newPresets[item.value] =
          s.schemaPresets[item.value] ?? structuredClone(s.schemaPresets[s.schemaPreset] ?? s.schemaPresets['default']);
        // Ensure name is updated on rename
        newPresets[item.value].name = item.label;
      });
      s.schemaPresets = newPresets;
    });
  };

  // Handler for the schema JSON textarea
  const handleSchemaValueChange = (newSchemaText: string) => {
    setSchemaText(newSchemaText); // Update UI immediately
    try {
      const parsedJson = JSON.parse(newSchemaText);
      updateAndRefresh((s) => {
        const preset = s.schemaPresets[s.schemaPreset];
        if (preset) {
          // Create a new presets object with the updated value
          s.schemaPresets = {
            ...s.schemaPresets,
            [s.schemaPreset]: { ...preset, value: parsedJson },
          };
        }
      });
    } catch (e) {
      // Invalid JSON, do nothing until it's valid. A visual error could be added.
    }
  };

  // Handler for the schema HTML textarea
  const handleSchemaHtmlChange = (newHtml: string) => {
    updateAndRefresh((s) => {
      const preset = s.schemaPresets[s.schemaPreset];
      if (preset) {
        // Create a new presets object with the updated html
        s.schemaPresets = {
          ...s.schemaPresets,
          [s.schemaPreset]: { ...preset, html: newHtml },
        };
      }
    });
  };

  // Restore only the JSON schema value for the current preset
  const restoreSchemaValueToDefault = async () => {
    const confirm = await SillyTavern.getContext().Popup.show.confirm(
      'Restore Default',
      'Are you sure you want to restore the default JSON schema for this preset?',
    );
    if (!confirm) return;

    const currentPresetKey = settings.schemaPreset;
    updateAndRefresh((s) => {
      const preset = s.schemaPresets[currentPresetKey];
      if (preset) {
        s.schemaPresets = {
          ...s.schemaPresets,
          [currentPresetKey]: { ...preset, value: DEFAULT_SCHEMA_VALUE },
        };
      }
    });
    setSchemaText(JSON.stringify(DEFAULT_SCHEMA_VALUE, null, 2));
  };

  // Restore only the HTML template for the current preset
  const restoreSchemaHtmlToDefault = async () => {
    const confirm = await SillyTavern.getContext().Popup.show.confirm(
      'Restore Default',
      'Are you sure you want to restore the default HTML template for this preset?',
    );
    if (!confirm) return;

    const currentPresetKey = settings.schemaPreset;
    updateAndRefresh((s) => {
      const preset = s.schemaPresets[currentPresetKey];
      if (preset) {
        s.schemaPresets = {
          ...s.schemaPresets,
          [currentPresetKey]: { ...preset, html: DEFAULT_SCHEMA_HTML },
        };
      }
    });
  };

  return (
    <div className="wtrackerlite-settings">
      <div className="inline-drawer">
        <div className="inline-drawer-toggle inline-drawer-header">
          <b>WTrackerLite</b>
          <div className="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div className="inline-drawer-content">

          {/* ── Connection Profile ── */}
          <hr />
          <h4 className="textAlignCenter">Connection Profile</h4>
          <div className="wtrackerlite-section">
            <STConnectionProfileSelect
              initialSelectedProfileId={settings.profileId}
              onChange={(profile) =>
                updateAndRefresh((s) => {
                  s.profileId = profile?.id ?? '';
                })
              }
            />
          </div>

          {/* ── General Settings ── */}
          <hr />
          <h4 className="textAlignCenter">General Settings</h4>
          <div className="wtrackerlite-section">
            <div className="setting-row">
              <label title="When to automatically run the tracker. 'Responses' triggers after AI messages, 'Inputs' after user messages, 'Both' for all messages.">Mode</label>
              <select
                className="text_pole"
                value={settings.autoMode}
                onChange={(e) =>
                  updateAndRefresh((s) => {
                    s.autoMode = e.target.value as AutoModeOptions;
                  })
                }
              >
                <option value="none">None</option>
                <option value="responses">Responses</option>
                <option value="inputs">Inputs</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div className="number-row">
              <input
                type="number"
                className="text_pole"
                min="0"
                step="1"
                value={settings.includeLastXMessages}
                onChange={(e) =>
                  updateAndRefresh((s) => {
                    s.includeLastXMessages = parseInt(e.target.value) || 0;
                  })
                }
              />
              <label title="How many recent chat messages to send to the tracker AI as context. Set to 0 to include the entire chat history.">Include Last N Messages (0 = all)</label>
            </div>
            <div className="number-row">
              <input
                type="number"
                className="text_pole"
                min="0"
                step="1"
                value={settings.includeLastXWTrackerLiteMessages}
                onChange={(e) =>
                  updateAndRefresh((s) => {
                    s.includeLastXWTrackerLiteMessages = parseInt(e.target.value) || 0;
                  })
                }
              />
              <label title="How many previous tracker outputs to inject into the chat context before generating a new tracker. Helps the AI maintain continuity. Set to 0 to disable.">Inject Last N Trackers</label>
            </div>
            <div className="number-row">
              <input
                type="checkbox"
                checked={settings.skipFirst}
                onChange={(e) =>
                  updateAndRefresh((s) => {
                    s.skipFirst = e.target.checked;
                  })
                }
              />
              <label title="Skip running the tracker on the very first message of a chat, where there may not be enough context yet.">Skip First Message</label>
            </div>
          </div>

          {/* ── Schema Settings ── */}
          <hr />
          <h4 className="textAlignCenter">Schema Settings</h4>
          <div className="wtrackerlite-section">
            <STPresetSelect
              label="Schema Preset"
              items={schemaPresetItems}
              value={settings.schemaPreset}
              onChange={handleSchemaPresetChange}
              onItemsChange={handleSchemaPresetsListChange}
              readOnlyValues={['default']}
              enableCreate
              enableDelete
              enableRename
            />
            <div className="label-row" style={{ marginTop: '8px' }}>
              <label title="The system prompt sent to the tracker AI. Use {{schema}} and {{example_response}} as placeholders.">Prompt</label>
              <STButton
                className="fa-solid fa-undo"
                title="Restore default prompt"
                onClick={async () => {
                  const confirm = await SillyTavern.getContext().Popup.show.confirm(
                    'Restore Default',
                    'Are you sure you want to restore the default prompt?',
                  );
                  if (!confirm) return;
                  updateAndRefresh((s) => {
                    s.promptJson = DEFAULT_PROMPT_JSON;
                  });
                }}
              />
            </div>
            <STTextarea
              value={settings.promptJson}
              onChange={(e) =>
                updateAndRefresh((s) => {
                  s.promptJson = e.target.value;
                })
              }
              rows={4}
            />
            <div className="label-row" style={{ marginTop: '8px' }}>
              <label title="The JSON schema that defines the structure of the tracker output. The AI will generate a JSON object conforming to this schema.">JSON Schema</label>
              <STButton className="fa-solid fa-undo" title="Restore default JSON schema" onClick={restoreSchemaValueToDefault} />
            </div>
            <STTextarea value={schemaText} onChange={(e) => handleSchemaValueChange(e.target.value)} rows={4} />
            <div className="label-row" style={{ marginTop: '8px' }}>
              <label title="Handlebars HTML template used to render the tracker display in the chat. Use {{data.field}} to reference tracker values.">HTML Template</label>
              <STButton className="fa-solid fa-undo" title="Restore default HTML template" onClick={restoreSchemaHtmlToDefault} />
            </div>
            <STTextarea
              value={settings.schemaPresets[settings.schemaPreset]?.html ?? ''}
              onChange={(e) => handleSchemaHtmlChange(e.target.value)}
              rows={4}
              placeholder="Enter your HTML template here..."
            />
          </div>

        </div>
      </div>
    </div>
  );
};
