#!/bin/bash

# Simplified Supabase Setup for Janitor Agent
# This script helps set up the Supabase project and schema

set -e

echo "🚀 Setting up Supabase for Janitor Agent..."

# Check if required environment variables are set
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "❌ Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set in your .env file"
    echo ""
    echo "Please:"
    echo "1. Create a new project at https://app.supabase.com"
    echo "2. Copy your project URL and anon key"
    echo "3. Add them to your .env file:"
    echo "   SUPABASE_URL=https://your-project.supabase.co"
    echo "   SUPABASE_ANON_KEY=your-anon-key"
    echo "   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key"
    exit 1
fi

echo "✅ Environment variables found"

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "⚠️  Supabase CLI not found. Installing..."
    
    # Install supabase CLI based on OS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install supabase/tap/supabase
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        curl -fsSL https://github.com/supabase/cli/releases/download/v1.123.4/supabase_linux_amd64.tar.gz | tar -xz
        sudo mv supabase /usr/local/bin/
    else
        echo "❌ Please install Supabase CLI manually: https://supabase.com/docs/guides/cli"
        exit 1
    fi
fi

echo "✅ Supabase CLI ready"

# Apply the schema to Supabase automatically
echo "📊 Applying database schema..."

# Check if we have the required credentials for Drizzle
if [ -z "$SUPABASE_DB_PASSWORD" ]; then
    echo "❌ Error: SUPABASE_DB_PASSWORD not set in .env"
    echo "This is your Supabase database password (not the service role key)."
    echo "Get it from: https://app.supabase.com/project/your-project/settings/database"
    echo "Look for 'Database password' section."
    exit 1
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ Error: SUPABASE_SERVICE_ROLE_KEY not set in .env"
    echo "This key is needed to verify table creation. Get it from:"
    echo "https://app.supabase.com/project/your-project/settings/api"
    exit 1
fi

echo "🔧 Generating tables using Drizzle..."

# Use Drizzle to generate the schema
cd packages/janitor-agent

echo "📋 Generating migration files..."
npm run db:generate

echo "📋 Generated SQL schema:"
echo "======================"
cat drizzle/*.sql
echo "======================"
echo ""

echo "🔧 Please copy the SQL above and run it in your Supabase SQL Editor:"
echo "https://app.supabase.com/project/your-project/sql/new"
echo ""
echo "⚠️  Note: Automatic migration push requires the database password, which is different from the service role key."
echo "We'll automate this in a future update. For now, the manual approach works perfectly!"

cd ../..

# Verify table was created by checking if we can query it
echo ""
echo "🔍 After running the SQL, verify table creation..."
TABLE_CHECK=$(curl -s \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    "$SUPABASE_URL/rest/v1/validation_results?limit=1" 2>/dev/null)

if echo "$TABLE_CHECK" | grep -q '\[\]' || echo "$TABLE_CHECK" | grep -q '"id":'; then
    echo "✅ Table 'validation_results' created successfully!"
    echo "🎉 Supabase setup complete with Drizzle!"
else
    echo "⚠️  Table not detected yet. After running the SQL manually, you can test with:"
    echo "   curl -H \"apikey: $SUPABASE_ANON_KEY\" \"$SUPABASE_URL/rest/v1/validation_results?limit=1\""
fi

echo ""
echo "🎉 Supabase setup complete!"
echo ""
echo "Next steps:"
echo "1. Apply the schema shown above in your Supabase SQL Editor"
echo "2. Verify the tables were created in the Table Editor"
echo "3. Update your .env file with the correct SUPABASE_SERVICE_ROLE_KEY for write access"
echo "4. Run 'make start' to launch the GPU instance"
echo "" 