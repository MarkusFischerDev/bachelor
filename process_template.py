import sys
import json
import time
from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap

# Initialize ruamel.yaml for proper YAML processing
yaml = YAML()
yaml.preserve_quotes = True  # Preserve original quotes
yaml.width = 1000  # Prevents line breaking
yaml.indent(mapping=2, sequence=4, offset=2)  # Preserve indentation

def read_input():
    """Reads the YAML template from stdin until the separator `---END-YAML---` is reached."""
    yaml_content = []
    while True:
        line = sys.stdin.readline()
        if not line:
            sys.stderr.write("Error: Unexpected end of input while reading YAML.\n")
            sys.exit(1)

        line = line.rstrip("\n")
        if line == "---END-YAML---":
            break  # Stop reading YAML when we reach the separator
        yaml_content.append(line)

    yaml_string = "\n".join(yaml_content).strip()

    if not yaml_string:
        sys.stderr.write("Error: Received empty YAML input.\n")
        sys.exit(1)

    try:
        return yaml.load(yaml_string)
    except Exception as e:
        sys.stderr.write(f"Error parsing YAML: {str(e)}\n")
        sys.exit(1)

def read_rules():
    json_input = sys.stdin.read().strip()

    if not json_input:
        return {"rules": []}

    try:
        rules = json.loads(json_input)
        if not isinstance(rules, dict) or "rules" not in rules:
            sys.stderr.write("Error: Invalid rules format. Expected a dictionary with a 'rules' key.\n")
            sys.exit(1)
        return rules
    except json.JSONDecodeError as e:
        sys.stderr.write(f"Error parsing JSON security rules: {str(e)}\n")
        sys.exit(1)

def validate_rules(rules, security_level, resources):
    if security_level not in ["low", "medium", "high"]:
        sys.stderr.write("Error: Invalid security level provided.\n")
        sys.exit(1)

    if security_level in ["medium", "high"] and rules:
        for rule in rules.get("rules", []):
            if "component" not in rule or "protocol" not in rule or "port" not in rule:
                sys.stderr.write("Error: Each rule must contain 'component', 'protocol', and 'port'.\n")
                sys.exit(1)
            try:
                rule["port"] = int(rule["port"])
            except ValueError:
                sys.stderr.write("Error: Port must be an integer.\n")
                sys.exit(1)
            if not -1 <= rule["port"] <= 65535:
                sys.stderr.write("Error: Port must be within range (-1..65535).\n")
                sys.exit(1)
            if security_level == "high" and "source" not in rule:
                sys.stderr.write("Error: High security level requires a 'source' field.\n")
                sys.exit(1)
            if rule["component"] not in resources:
                sys.stderr.write(f"Error: Component {rule['component']} not found in Resources.\n")
                sys.exit(1)

def modify_security_group(template, security_level, rules):
    """Modifies security groups in the CloudFormation template based on provided rules."""
    resources = template.get("Resources", CommentedMap())
    validate_rules(rules, security_level, resources)

    def modify_security_group_rules(component, protocol=None, port=None, source=None):
        """Modifies or adds security group rules based on security level."""
        if component not in resources or resources[component].get("Type") != "AWS::EC2::SecurityGroup":
            sys.stderr.write(f"Error: {component} not found in Resources.\n")
            sys.exit(1)

        # Identify existing security group ingress rules for this component
        existing_rules = [
            key for key, value in resources.items()
            if value.get("Type") == "AWS::EC2::SecurityGroupIngress" and value["Properties"].get("GroupId") == f"!Ref {component}"
        ]

        if security_level == "low":
            # Remove all existing ingress rules for the component
            for rule in existing_rules:
                del resources[rule]

            # Add an allow-all rule
            resources[f"{component}IngressAllowAll"] = CommentedMap({
                "Type": "AWS::EC2::SecurityGroupIngress",
                "Properties": {
                    "GroupId": f"!Ref {component}",
                    "IpProtocol": "-1",
                    "FromPort": -1,
                    "ToPort": -1,
                    "CidrIp": "0.0.0.0/0"
                }
            })
        elif security_level in ["medium", "high"]:
            # Ensure multiple rules for the same component are added instead of overwriting
            rule_key = f"{component}Ingress_{protocol}_{port}"
            if security_level == "high":
                rule_key += f"_{source.replace('.', '_')}"

            new_rule = CommentedMap({
                "Type": "AWS::EC2::SecurityGroupIngress",
                "Properties": {
                    "GroupId": f"!Ref {component}",
                    "IpProtocol": protocol,
                    "FromPort": int(port),
                    "ToPort": int(port),
                    "CidrIp": source if security_level == "high" else "0.0.0.0/0"
                }
            })
            resources[rule_key] = new_rule  # Add multiple rules without overwriting

    if security_level in ["medium", "high"] and rules:
        for rule in rules.get("rules", []):
            modify_security_group_rules(
                rule["component"], rule["protocol"], rule["port"], rule.get("source")
            )
    elif security_level == "low":
        # Apply "low" security rules to all known security groups
        for component in ["SecurityGroupALB", "SecurityGroupECS", "SecurityGroupDB"]:
            modify_security_group_rules(component)

    return template

def output_result(template):
    """Outputs the modified YAML file while preserving formatting."""
    yaml.dump(template, sys.stdout)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.stderr.write("Error: Missing arguments. Expected <security_level> <file_name>.\n")
        sys.exit(1)

    security_level = sys.argv[1]
    template = read_input()
    if security_level != "low":
        rules = read_rules() 
    else:
        rules = []
        
    
    modified_template = modify_security_group(template, security_level, rules)
    output_result(modified_template)
