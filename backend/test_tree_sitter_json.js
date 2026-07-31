/**
 * backend/test_tree_sitter_json.js
 * Test Tool: Inspects Web-Tree-Sitter AST & JSON Output Generation.
 */

import { parseFileAST } from './src/parsers/ast_parser.js';
import fs from 'fs';

async function testTreeSitterJSON() {
  console.log('=====================================================');
  console.log('🌳 Web-Tree-Sitter AST Parser JSON Output Inspector');
  console.log('=====================================================');

  // Sample Python source code file
  const pyFilePath = 'sample_script.py';
  const pyCode = `
import os
import sys

class AccountManager:
    def __init__(self, owner):
        self.owner = owner

    def deposit_funds(self, amount):
        if amount <= 0:
            raise ValueError("Amount must be positive")
        return {"owner": self.owner, "balance": amount}

@app.route('/api/deposit', methods=['POST'])
def handle_deposit():
    data = request.json
    return deposit_funds(data['amount'])
`;

  // Sample Java source code file
  const javaFilePath = 'PaymentService.java';
  const javaCode = `
import java.util.List;
import org.springframework.web.bind.annotation.*;

public class PaymentService {
    
    @PostMapping("/api/pay")
    public PaymentResponse processTransaction(String userId, double amount) {
        if (amount <= 0) {
            throw new IllegalArgumentException("Invalid payment amount");
        }
        return new PaymentResponse("TX_100", amount);
    }
}
`;

  console.log('\n--- 1. Parsing Python file with Tree-Sitter Engine ---');
  const pyASTJson = parseFileAST(pyFilePath, pyCode);
  console.log(JSON.stringify(pyASTJson, null, 2));

  console.log('\n--- 2. Parsing Java file with Tree-Sitter Engine ---');
  const javaASTJson = parseFileAST(javaFilePath, javaCode);
  console.log(JSON.stringify(javaASTJson, null, 2));

  // Save JSON outputs to file
  const outputJsonFile = 'tree_sitter_ast_output.json';
  const outputData = {
    pythonAST: pyASTJson,
    javaAST: javaASTJson
  };

  fs.writeFileSync(outputJsonFile, JSON.stringify(outputData, null, 2));
  console.log(`\n=====================================================`);
  console.log(`✅ Saved complete Tree-Sitter AST JSON output to: ${outputJsonFile}`);
  console.log(`=====================================================`);
}

testTreeSitterJSON().catch(console.error);
