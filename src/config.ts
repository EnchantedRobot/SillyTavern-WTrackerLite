import { AutoModeOptions } from 'sillytavern-utils-lib/types/translate';

export interface Schema {
  name: string;
  value: object;
  html: string;
}

export interface ExtensionSettings {
  version: string;
  formatVersion: string;
  profileId: string;
  autoMode: AutoModeOptions;
  schemaPreset: string;
  schemaPresets: Record<string, Schema>;
  includeLastXMessages: number; // 0 means all messages
  includeLastXWTrackerLiteMessages: number; // 0 means none
  skipFirst: boolean;
  promptJson: string;
}

export const extensionName = 'SillyTavern-WTrackerLite';

export const DEFAULT_PROMPT_JSON = `You are a highly specialized AI assistant. Your SOLE purpose is to generate a single, valid JSON object that strictly adheres to the provided JSON schema.

**CRITICAL INSTRUCTIONS:**
1.  You MUST wrap the entire JSON object in a markdown code block (\`\`\`json\\n...\\n\`\`\`).
2.  Your response MUST NOT contain any explanatory text, comments, or any other content outside of this single code block.
3.  The JSON object inside the code block MUST be valid and conform to the schema.

**JSON SCHEMA TO FOLLOW:**
\`\`\`json
{{schema}}
\`\`\`

**EXAMPLE OF A PERFECT RESPONSE:**
\`\`\`json
{{example_response}}
\`\`\`
`;

export const DEFAULT_SCHEMA_VALUE: object = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'SceneTracker',
  description: 'Schema for tracking roleplay scene details',
  type: 'object',
  properties: {
    location: {
      type: 'string',
      description: 'Specific scene location with increasing specificity',
    },
    weather: {
      type: 'string',
      description: 'Current weather conditions and temperature',
    },
    charactersPresent: {
      type: 'array',
      items: {
        type: 'string',
        description: 'Character name',
      },
      description: 'List of character names present in scene',
    },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Character name',
          },
          hair: {
            type: 'string',
            description: 'Hairstyle and condition',
          },
          outfit: {
            type: 'string',
            description: 'Complete outfit including underwear',
          },
        },
        required: ['name', 'hair', 'outfit'],
      },
      description: 'Array of character objects',
    },
  },
  required: ['location', 'weather', 'charactersPresent', 'characters'],
};

export const DEFAULT_SCHEMA_HTML = `<div class="wtrackerlite_default_mes_template">
   <!-- Main Scene Information -->
   <table>
      <tbody>
         <tr>
            <td>Present:</td>
            <td>
               <!-- Joining an array of strings. Assumes a 'join' helper. -->
               {{join data.charactersPresent ', '}}
            </td>
         </tr>
      </tbody>
   </table>
   <!-- Collapsible Detailed Tracker -->
   <details>
      <summary><span>Tracker Details</span></summary>
      <table>
        <tbody>
          <tr>
            <td>Location:</td>
            <td>{{data.location}}</td>
          </tr>
          <tr>
            <td>Weather:</td>
            <td>{{data.weather}}</td>
          </tr>
        </tbody>
      </table>
      <!-- Looping through the array of character objects -->
      {{#each data.characters as |character|}}
      <table>
          <tbody>
            <tr>
                <td>Name:</td>
                <td>{{character.name}}</td>
            </tr>
            <tr>
                <td>Hair:</td>
                <td>{{character.hair}}</td>
            </tr>
            <tr>
                <td>Outfit:</td>
                <td>{{character.outfit}}</td>
            </tr>
          </tbody>
      </table>
      {{/each}}
   </details>
</div>`;

const VERSION = '0.1.0';
const FORMAT_VERSION = 'F_1.0';
export const EXTENSION_KEY = 'WTrackerLite';

export const defaultSettings: ExtensionSettings = {
  version: VERSION,
  formatVersion: FORMAT_VERSION,
  profileId: '',
  autoMode: AutoModeOptions.NONE,
  schemaPreset: 'default',
  schemaPresets: {
    default: {
      name: 'Default',
      value: DEFAULT_SCHEMA_VALUE,
      html: DEFAULT_SCHEMA_HTML,
    },
  },
  includeLastXMessages: 0,
  includeLastXWTrackerLiteMessages: 1,
  skipFirst: true,
  promptJson: DEFAULT_PROMPT_JSON,
};
