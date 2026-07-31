/**
 * backend/src/testing/llm_test_generator.js
 * Industrial AI Test Synthesizer Agent: Generates production-ready unit tests using Gemini API.
 */

import { callGemini } from '../services/llm_service.js';

export async function runLLMTestGeneration(astSummary, fileContent, apiKey = null) {
  const activeKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY || apiKey;
  if (!activeKey) {
    return null;
  }

  const prompt = `You are a senior software engineer specializing in unit testing.

Analyze the provided source code file carefully and generate executable unit tests specifically tailored to the actual functions, classes, methods, signatures, and business logic present in the file.

Target File Metadata:
- File Path: ${astSummary.filePath}
- Detected Language: ${astSummary.language}
- Extracted AST Signatures: ${JSON.stringify(astSummary.functions || [])}
- Extracted Imports & Dependencies: ${JSON.stringify(astSummary.imports || [])}

Requirements:
1. Identify every testable function/class/method from the source code.
2. Generate realistic unit tests based only on the existing implementation logic.
3. Do not create imaginary functions, parameters, classes, or behaviors.
4. Match the exact function signatures, parameter types, return types, and expected behaviors.
5. Include:
   - Happy path test cases
   - Negative scenarios
   - Exception/error handling cases
   - Boundary value tests
   - Invalid input validation tests
   - Edge cases specific to the implementation
6. Mock all external dependencies appropriately:
   - Database connections
   - API calls
   - File systems
   - Third-party libraries
   - External services
   - Environment variables
7. Create realistic mock objects and fixtures matching the actual dependency interfaces.
8. Verify:
   - Return values
   - Side effects
   - Function calls
   - Dependency interactions
   - Raised exceptions
9. Add inline comments explaining the purpose of every test case.
10. Follow the existing project testing conventions and imports.
11. Use the correct testing framework based on the project:
    - Python: pytest/unittest
    - JavaScript/TypeScript: Jest
    - Java: JUnit
    - C#: NUnit/xUnit
    - Other languages: use the project standard.
12. Ensure the generated test file can execute successfully without manual modification.

Testing goals:
- Achieve meaningful coverage, not just line coverage.
- Focus on validating business behavior.
- Avoid redundant tests.
- Avoid testing implementation details unless necessary.

Output requirements:
- Output ONLY the raw executable test code.
- Do not include explanations.
- Do not include markdown formatting.
- Do not include code fences.
- The output should be directly saved as a test file and executed.

Source Code to Test:
\`\`\`
${fileContent.substring(0, 3000)}
\`\`\``;

  try {
    const rawResponse = await callGemini({
      prompt,
      systemPrompt: 'You are a senior software test engineer AI. Output clean, raw executable test code only.',
      apiKey: activeKey,
      model: 'gemini-2.5-flash'
    });

    if (!rawResponse) return null;

    return rawResponse.replace(/```[a-z]*/gi, '').trim();
  } catch (err) {
    console.error('[LLM Test Generator Error]:', err.message);
    return null;
  }
}
