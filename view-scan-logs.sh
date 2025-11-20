#!/bin/bash
# Helper script to view scan console logs

set -e

SCANS_DIR="/app/logs/scans"

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}=== Tella AI Scan Logs ===${NC}\n"

# Function to list all scans
list_scans() {
    echo -e "${GREEN}Available scans:${NC}"
    docker compose exec app sh -c "cd $SCANS_DIR 2>/dev/null && ls -1" 2>/dev/null || {
        echo -e "${YELLOW}No scans found yet. Run a scan first!${NC}"
        exit 0
    }
    echo ""
}

# Function to view a specific scan
view_scan() {
    local scan_id=$1
    echo -e "${GREEN}Viewing scan: ${CYAN}$scan_id${NC}\n"
    docker compose exec app cat "$SCANS_DIR/$scan_id/console.log" 2>/dev/null || {
        echo -e "${RED}Error: Scan $scan_id not found or log file doesn't exist${NC}"
        exit 1
    }
}

# Function to follow a scan in real-time
follow_scan() {
    local scan_id=$1
    echo -e "${GREEN}Following scan: ${CYAN}$scan_id${NC}"
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}\n"
    docker compose exec app tail -f "$SCANS_DIR/$scan_id/console.log" 2>/dev/null || {
        echo -e "${RED}Error: Scan $scan_id not found${NC}"
        exit 1
    }
}

# Function to copy scan to host
copy_scan() {
    local scan_id=$1
    local output_file="${2:-scan_${scan_id}.log}"
    echo -e "${GREEN}Copying scan ${CYAN}$scan_id${GREEN} to ${CYAN}$output_file${NC}"
    docker compose cp "tella-app:$SCANS_DIR/$scan_id/console.log" "$output_file" 2>/dev/null || {
        echo -e "${RED}Error: Failed to copy scan log${NC}"
        exit 1
    }
    echo -e "${GREEN}✓ Scan log saved to: ${CYAN}$output_file${NC}"
}

# Parse arguments
case "$1" in
    "")
        # No arguments - list all scans
        list_scans
        ;;
    list|ls)
        list_scans
        ;;
    view|cat)
        if [ -z "$2" ]; then
            echo -e "${RED}Error: Please specify a scan ID${NC}"
            echo "Usage: $0 view <scan-id>"
            exit 1
        fi
        view_scan "$2"
        ;;
    follow|tail)
        if [ -z "$2" ]; then
            echo -e "${RED}Error: Please specify a scan ID${NC}"
            echo "Usage: $0 follow <scan-id>"
            exit 1
        fi
        follow_scan "$2"
        ;;
    copy|export)
        if [ -z "$2" ]; then
            echo -e "${RED}Error: Please specify a scan ID${NC}"
            echo "Usage: $0 copy <scan-id> [output-file]"
            exit 1
        fi
        copy_scan "$2" "$3"
        ;;
    help|--help|-h)
        echo "Usage: $0 [command] [options]"
        echo ""
        echo "Commands:"
        echo "  list, ls               List all available scans"
        echo "  view <scan-id>         View a specific scan log"
        echo "  follow <scan-id>       Follow a scan in real-time"
        echo "  copy <scan-id> [file]  Copy scan log to host"
        echo "  help                   Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0                                    # List all scans"
        echo "  $0 view abc123-def456-...            # View specific scan"
        echo "  $0 follow abc123-def456-...          # Follow scan in real-time"
        echo "  $0 copy abc123-def456-... output.log # Copy to output.log"
        ;;
    *)
        # Assume it's a scan ID
        view_scan "$1"
        ;;
esac
