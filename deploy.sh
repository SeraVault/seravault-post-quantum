#!/bin/bash

# Seravault Firebase Deployment Script
# This script handles the complete deployment process for the Seravault application

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="seravault-8c764"
FUNCTIONS_DIR="functions"
BUILD_DIR="dist"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
check_command() {
    if ! command -v "$1" &> /dev/null; then
        print_error "$1 is required but not installed."
        exit 1
    fi
}

# Function to confirm deployment
confirm_deployment() {
    echo
    print_warning "You are about to deploy to Firebase project: $PROJECT_ID"
    echo -e "This will deploy:"
    echo -e "  • React application (hosting)"
    echo -e "  • Cloud Functions"
    echo -e "  • Firestore rules and indexes"
    echo -e "  • Storage rules"
    echo
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_error "Deployment cancelled."
        exit 1
    fi
}

# Function to run tests
run_tests() {
    print_status "Running tests..."

    # Run unit tests
    if npm run test:run; then
        print_success "Unit tests passed"
    else
        print_error "Unit tests failed"
        exit 1
    fi

    # Run e2e tests (optional - comment out if not needed for every deployment)
    # print_status "Running e2e tests..."
    # if npm run test:e2e; then
    #     print_success "E2E tests passed"
    # else
    #     print_error "E2E tests failed"
    #     exit 1
    # fi
}

# Function to lint code
lint_code() {
    print_status "Running linter..."
    if npm run lint; then
        print_success "Linting passed"
    else
        print_warning "Linting issues found, but continuing deployment"
        sleep 2
    fi
}

# Function to build the application
build_app() {
    print_status "Building React application..."

    # Clean previous build
    if [ -d "$BUILD_DIR" ]; then
        rm -rf "$BUILD_DIR"
        print_status "Cleaned previous build"
    fi

    # Build the application (skip TypeScript checking for deployment)
    echo "Building application..."
    npm run build:deploy
    build_exit_code=$?

    # Check if build succeeded (Vite will succeed even with TypeScript warnings)
    if [ $build_exit_code -eq 0 ]; then
        print_success "React application built successfully"
    else
        print_error "Failed to build React application"
        exit 1
    fi

    # Verify build output
    if [ ! -d "$BUILD_DIR" ] || [ ! -f "$BUILD_DIR/index.html" ]; then
        print_error "Build output not found in $BUILD_DIR"
        exit 1
    fi

    print_success "Build verification passed"
}

# Function to build functions
build_functions() {
    print_status "Building Cloud Functions..."

    if [ -d "$FUNCTIONS_DIR" ]; then
        cd "$FUNCTIONS_DIR"

        # Install dependencies if needed
        if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
            print_status "Installing function dependencies..."
            npm install
        fi

        # Build functions
        if npm run build; then
            print_success "Cloud Functions built successfully"
        else
            print_error "Failed to build Cloud Functions"
            cd ..
            exit 1
        fi

        cd ..
    else
        print_warning "Functions directory not found, skipping functions build"
    fi
}

# Function to validate Firebase configuration
validate_firebase_config() {
    print_status "Validating Firebase configuration..."

    # Check if firebase.json exists
    if [ ! -f "firebase.json" ]; then
        print_error "firebase.json not found"
        exit 1
    fi

    # Check if firestore rules exist
    if [ ! -f "firestore.rules" ]; then
        print_warning "firestore.rules not found"
    fi

    # Check if storage rules exist
    if [ ! -f "storage.rules" ]; then
        print_warning "storage.rules not found"
    fi

    print_success "Firebase configuration validated"
}

# Function to configure CORS
configure_cors() {
    print_status "Configuring CORS for Firebase Storage..."

    if [ -f "cors.json" ]; then
        if gsutil cors set cors.json "gs://$PROJECT_ID.firebasestorage.app"; then
            print_success "CORS configuration applied successfully"
        else
            print_warning "Failed to apply CORS configuration (continuing anyway)"
        fi
    else
        print_warning "cors.json not found, skipping CORS configuration"
    fi
}

# Function to deploy to Firebase
deploy_firebase() {
    print_status "Deploying to Firebase..."

    # Set the Firebase project
    firebase use "$PROJECT_ID"

    # Configure CORS for storage
    configure_cors

    # Deploy all services
    if firebase deploy; then
        print_success "Deployment completed successfully!"
        print_status "Your app is now live at: https://$PROJECT_ID.web.app"
    else
        print_error "Deployment failed"
        exit 1
    fi
}

# Function to deploy specific service
deploy_specific() {
    local service=$1
    print_status "Deploying $service only..."

    firebase use "$PROJECT_ID"

    case $service in
        "hosting")
            build_app
            firebase deploy --only hosting
            ;;
        "functions")
            build_functions
            firebase deploy --only functions
            ;;
        "firestore")
            firebase deploy --only firestore
            ;;
        "storage")
            firebase deploy --only storage
            ;;
        *)
            print_error "Unknown service: $service"
            print_error "Available services: hosting, functions, firestore, storage"
            exit 1
            ;;
    esac

    if [ $? -eq 0 ]; then
        print_success "$service deployed successfully!"
    else
        print_error "$service deployment failed"
        exit 1
    fi
}

# Function to show help
show_help() {
    echo "Seravault Firebase Deployment Script"
    echo
    echo "Usage: $0 [OPTIONS] [SERVICE]"
    echo
    echo "OPTIONS:"
    echo "  -h, --help          Show this help message"
    echo "  -t, --test          Run tests before deployment"
    echo "  -s, --skip-confirm  Skip deployment confirmation"
    echo "  -l, --lint          Run linter before deployment"
    echo
    echo "SERVICE (optional):"
    echo "  hosting             Deploy only the React app"
    echo "  functions           Deploy only Cloud Functions"
    echo "  firestore           Deploy only Firestore rules and indexes"
    echo "  storage             Deploy only Storage rules"
    echo
    echo "If no service is specified, all services will be deployed."
    echo
    echo "Examples:"
    echo "  $0                  # Deploy everything"
    echo "  $0 hosting          # Deploy only the React app"
    echo "  $0 -t               # Run tests then deploy everything"
    echo "  $0 -s functions     # Deploy functions without confirmation"
}

# Main execution
main() {
    local run_tests_flag=false
    local skip_confirm=false
    local run_lint=false
    local service=""

    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -t|--test)
                run_tests_flag=true
                shift
                ;;
            -s|--skip-confirm)
                skip_confirm=true
                shift
                ;;
            -l|--lint)
                run_lint=true
                shift
                ;;
            hosting|functions|firestore|storage)
                service=$1
                shift
                ;;
            *)
                print_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done

    print_status "Starting Seravault deployment process..."

    # Check required commands
    check_command "node"
    check_command "npm"
    check_command "firebase"

    # Confirm deployment (unless skipped)
    if [ "$skip_confirm" = false ]; then
        confirm_deployment
    fi

    # Run linter if requested
    if [ "$run_lint" = true ]; then
        lint_code
    fi

    # Run tests if requested
    if [ "$run_tests_flag" = true ]; then
        run_tests
    fi

    # Validate Firebase configuration
    validate_firebase_config

    # Deploy specific service or everything
    if [ -n "$service" ]; then
        deploy_specific "$service"
    else
        # Full deployment
        build_app
        build_functions
        deploy_firebase
    fi

    print_success "Deployment process completed!"
}

# Run main function with all arguments
main "$@"