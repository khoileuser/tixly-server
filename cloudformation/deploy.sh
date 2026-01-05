#!/bin/bash

# Tixly Infrastructure Deployment Script
# Usage: ./deploy.sh [deploy|update|delete|outputs|validate]

STACK_NAME="tixly-infrastructure"
TEMPLATE_FILE="tixly-infrastructure.yaml"
REGION="us-east-1"

# Default parameters - modify as needed
ENVIRONMENT="production"
PROJECT_NAME="tixly"
CONTAINER_IMAGE=""  # Leave empty for initial deployment

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

validate_template() {
    print_status "Validating CloudFormation template..."
    aws cloudformation validate-template \
        --template-body file://${TEMPLATE_FILE} \
        --region ${REGION}
    
    if [ $? -eq 0 ]; then
        print_status "Template validation successful!"
    else
        print_error "Template validation failed!"
        exit 1
    fi
}

deploy_stack() {
    print_status "Deploying CloudFormation stack: ${STACK_NAME}"
    
    # Check if stack already exists
    aws cloudformation describe-stacks --stack-name ${STACK_NAME} --region ${REGION} > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        print_warning "Stack already exists. Use 'update' command instead."
        exit 1
    fi
    
    aws cloudformation create-stack \
        --stack-name ${STACK_NAME} \
        --template-body file://${TEMPLATE_FILE} \
        --region ${REGION} \
        --capabilities CAPABILITY_NAMED_IAM \
        --parameters \
            ParameterKey=Environment,ParameterValue=${ENVIRONMENT} \
            ParameterKey=ProjectName,ParameterValue=${PROJECT_NAME} \
        --tags \
            Key=Project,Value=${PROJECT_NAME} \
            Key=Environment,Value=${ENVIRONMENT}
    
    if [ $? -eq 0 ]; then
        print_status "Stack creation initiated. Waiting for completion..."
        aws cloudformation wait stack-create-complete \
            --stack-name ${STACK_NAME} \
            --region ${REGION}
        
        if [ $? -eq 0 ]; then
            print_status "Stack created successfully!"
            get_outputs
        else
            print_error "Stack creation failed!"
            aws cloudformation describe-stack-events \
                --stack-name ${STACK_NAME} \
                --region ${REGION} \
                --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`].[LogicalResourceId,ResourceStatusReason]' \
                --output table
            exit 1
        fi
    else
        print_error "Failed to initiate stack creation!"
        exit 1
    fi
}

update_stack() {
    print_status "Updating CloudFormation stack: ${STACK_NAME}"
    
    # Build parameters array
    PARAMS="ParameterKey=Environment,ParameterValue=${ENVIRONMENT}"
    PARAMS="${PARAMS} ParameterKey=ProjectName,ParameterValue=${PROJECT_NAME}"
    
    if [ -n "${CONTAINER_IMAGE}" ]; then
        PARAMS="${PARAMS} ParameterKey=ContainerImage,ParameterValue=${CONTAINER_IMAGE}"
    fi
    
    aws cloudformation update-stack \
        --stack-name ${STACK_NAME} \
        --template-body file://${TEMPLATE_FILE} \
        --region ${REGION} \
        --capabilities CAPABILITY_NAMED_IAM \
        --parameters ${PARAMS}
    
    if [ $? -eq 0 ]; then
        print_status "Stack update initiated. Waiting for completion..."
        aws cloudformation wait stack-update-complete \
            --stack-name ${STACK_NAME} \
            --region ${REGION}
        
        if [ $? -eq 0 ]; then
            print_status "Stack updated successfully!"
            get_outputs
        else
            print_error "Stack update failed!"
            exit 1
        fi
    else
        print_error "Failed to initiate stack update!"
        exit 1
    fi
}

delete_stack() {
    print_warning "This will delete the stack and ALL resources!"
    read -p "Are you sure you want to delete ${STACK_NAME}? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        print_status "Deletion cancelled."
        exit 0
    fi
    
    print_status "Deleting CloudFormation stack: ${STACK_NAME}"
    
    # First, empty the S3 bucket (required before deletion)
    print_status "Emptying S3 bucket..."
    aws s3 rm s3://${PROJECT_NAME} --recursive --region ${REGION} 2>/dev/null
    
    aws cloudformation delete-stack \
        --stack-name ${STACK_NAME} \
        --region ${REGION}
    
    if [ $? -eq 0 ]; then
        print_status "Stack deletion initiated. Waiting for completion..."
        aws cloudformation wait stack-delete-complete \
            --stack-name ${STACK_NAME} \
            --region ${REGION}
        
        if [ $? -eq 0 ]; then
            print_status "Stack deleted successfully!"
        else
            print_error "Stack deletion failed!"
            exit 1
        fi
    else
        print_error "Failed to initiate stack deletion!"
        exit 1
    fi
}

get_outputs() {
    print_status "Stack Outputs:"
    aws cloudformation describe-stacks \
        --stack-name ${STACK_NAME} \
        --region ${REGION} \
        --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
        --output table
}

get_status() {
    print_status "Stack Status:"
    aws cloudformation describe-stacks \
        --stack-name ${STACK_NAME} \
        --region ${REGION} \
        --query 'Stacks[0].[StackName,StackStatus,CreationTime,LastUpdatedTime]' \
        --output table
}

show_usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  deploy    - Create a new CloudFormation stack"
    echo "  update    - Update an existing stack"
    echo "  delete    - Delete the stack and all resources"
    echo "  outputs   - Show stack outputs"
    echo "  status    - Show stack status"
    echo "  validate  - Validate the CloudFormation template"
    echo ""
    echo "Environment variables:"
    echo "  CONTAINER_IMAGE - Set to update with a container image"
    echo ""
    echo "Examples:"
    echo "  $0 deploy"
    echo "  CONTAINER_IMAGE=123456.dkr.ecr.us-east-1.amazonaws.com/tixly:latest $0 update"
}

# Main script
case "$1" in
    deploy)
        validate_template
        deploy_stack
        ;;
    update)
        validate_template
        update_stack
        ;;
    delete)
        delete_stack
        ;;
    outputs)
        get_outputs
        ;;
    status)
        get_status
        ;;
    validate)
        validate_template
        ;;
    *)
        show_usage
        exit 1
        ;;
esac
