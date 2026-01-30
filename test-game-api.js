/**
 * Test script for Game Statistics API
 *
 * Usage: node test-game-api.js
 *
 * Make sure the server is running on port 80 before running this test
 */

import axios from 'axios';

const API_BASE = 'http://localhost:80';

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testGameAPI() {
    try {
        log('\n========================================', 'blue');
        log('Testing Game Statistics API', 'blue');
        log('========================================\n', 'blue');

        // Test data
        const testGameId = 'test-game-123';
        const testUserId = 'test-user-456';

        // Test 1: Track a game click without sharedBy
        log('Test 1: Tracking game click (direct play)...', 'yellow');
        try {
            const response1 = await axios.post(`${API_BASE}/api/game/track`, {
                gameId: testGameId
            });
            log('✓ Direct play tracked successfully', 'green');
            log(`  Response: ${JSON.stringify(response1.data)}\n`, 'reset');
        } catch (error) {
            log(`✗ Failed to track direct play: ${error.message}`, 'red');
            if (error.response) {
                log(`  Status: ${error.response.status}`, 'red');
                log(`  Response: ${JSON.stringify(error.response.data)}\n`, 'red');
            }
        }

        // Test 2: Track a game click with sharedBy
        log('Test 2: Tracking game click (from share)...', 'yellow');
        try {
            const response2 = await axios.post(`${API_BASE}/api/game/track`, {
                gameId: testGameId,
                sharedBy: testUserId
            });
            log('✓ Share play tracked successfully', 'green');
            log(`  Response: ${JSON.stringify(response2.data)}\n`, 'reset');
        } catch (error) {
            log(`✗ Failed to track share play: ${error.message}`, 'red');
            if (error.response) {
                log(`  Status: ${error.response.status}`, 'red');
                log(`  Response: ${JSON.stringify(error.response.data)}\n`, 'red');
            }
        }

        // Add a few more clicks for testing
        log('Adding more test clicks...', 'yellow');
        for (let i = 0; i < 3; i++) {
            await axios.post(`${API_BASE}/api/game/track`, {
                gameId: testGameId,
                sharedBy: i % 2 === 0 ? testUserId : null
            });
        }
        log('✓ Additional clicks added\n', 'green');

        // Test 3: Get game statistics
        log('Test 3: Getting game statistics...', 'yellow');
        try {
            const response3 = await axios.get(`${API_BASE}/api/game/stats/${testGameId}`);
            log('✓ Game stats retrieved successfully', 'green');
            log(`  Play Count: ${response3.data.data.playCount}`, 'reset');
            log(`  Full Response: ${JSON.stringify(response3.data, null, 2)}\n`, 'reset');
        } catch (error) {
            log(`✗ Failed to get game stats: ${error.message}`, 'red');
            if (error.response) {
                log(`  Status: ${error.response.status}`, 'red');
                log(`  Response: ${JSON.stringify(error.response.data)}\n`, 'red');
            }
        }

        // Test 4: Get detailed game statistics
        log('Test 4: Getting detailed game statistics...', 'yellow');
        try {
            const response4 = await axios.get(`${API_BASE}/api/game/stats/${testGameId}/detailed`);
            log('✓ Detailed stats retrieved successfully', 'green');
            log(`  Full Response: ${JSON.stringify(response4.data, null, 2)}\n`, 'reset');
        } catch (error) {
            log(`✗ Failed to get detailed stats: ${error.message}`, 'red');
            if (error.response) {
                log(`  Status: ${error.response.status}`, 'red');
                log(`  Response: ${JSON.stringify(error.response.data)}\n`, 'red');
            }
        }

        // Test 5: Get user share statistics
        log('Test 5: Getting user share statistics...', 'yellow');
        try {
            const response5 = await axios.get(`${API_BASE}/api/game/user/${testUserId}/shares`);
            log('✓ User share stats retrieved successfully', 'green');
            log(`  Full Response: ${JSON.stringify(response5.data, null, 2)}\n`, 'reset');
        } catch (error) {
            log(`✗ Failed to get user share stats: ${error.message}`, 'red');
            if (error.response) {
                log(`  Status: ${error.response.status}`, 'red');
                log(`  Response: ${JSON.stringify(error.response.data)}\n`, 'red');
            }
        }

        // Test 6: Test error handling (invalid gameId)
        log('Test 6: Testing error handling (empty gameId)...', 'yellow');
        try {
            const response6 = await axios.post(`${API_BASE}/api/game/track`, {
                gameId: ''
            });
            log('✗ Should have returned an error', 'red');
        } catch (error) {
            if (error.response && error.response.status === 400) {
                log('✓ Error handling works correctly', 'green');
                log(`  Response: ${JSON.stringify(error.response.data)}\n`, 'reset');
            } else {
                log(`✗ Unexpected error: ${error.message}`, 'red');
            }
        }

        log('\n========================================', 'blue');
        log('All tests completed!', 'blue');
        log('========================================\n', 'blue');

    } catch (error) {
        log(`\n✗ Test suite failed: ${error.message}`, 'red');
        process.exit(1);
    }
}

// Run tests
testGameAPI();
