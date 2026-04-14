export function parseResponse(content: string): object {
  const codeBlockRegex = /```(?:\w+\n|\n)([\s\S]*?)```/;
  const codeBlockMatch = content.match(codeBlockRegex);
  const cleanedContent = codeBlockMatch ? codeBlockMatch[1].trim() : content.trim();

  try {
    return JSON.parse(cleanedContent);
  } catch (error: any) {
    console.error('Error parsing response:', error);
    console.error('Raw content received:', content);
    throw new Error('Model response is not valid JSON.');
  }
}
