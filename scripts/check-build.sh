#!/bin/bash

# Pre-deployment Build Check Script
# Run this before committing to catch TypeScript errors early

set -e

echo "🔍 Running pre-deployment build checks..."
echo ""

cd packages/janitor-agent

echo "📦 Installing dependencies..."
npm install

echo ""
echo "📋 Checking TypeScript compilation..."
if npm run build; then
    echo ""
    echo "✅ All checks passed! Ready to deploy."
    echo ""
    echo "🚀 To deploy: make deploy"
    echo "📋 To check: make status"
else
    echo ""
    echo "❌ Build failed! Please fix TypeScript errors before deploying."
    echo ""
    echo "💡 Common fixes:"
    echo "  - Add proper type annotations for Express handlers"
    echo "  - Check for null/undefined values in AI models"
    echo "  - Ensure all imports have proper types"
    exit 1
fi 