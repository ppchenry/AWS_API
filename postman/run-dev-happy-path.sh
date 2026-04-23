#!/usr/bin/env bash
# Runs the PetPetClub Dev happy-path Postman collection via the Postman CLI.
# Reads DEV_BASE_URL / DEV_API_KEY from the repo-root .env file and passes them
# as environment variables to the CLI so no secret is committed to the env JSON.
#
# Usage:
#   ./postman/run-dev-happy-path.sh
#   ./postman/run-dev-happy-path.sh --verbose
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
ENV_FILE="$ROOT/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

: "${DEV_BASE_URL:?DEV_BASE_URL missing in .env}"
: "${DEV_API_KEY:?DEV_API_KEY missing in .env}"
# JWT_SECRET is the symmetric HS256 key shared with the Dev lambdas (see env.json).
# Defaults to the Dev value if omitted from .env.
: "${JWT_SECRET:=PPCSecret}"

PUBLIC_COLLECTION="$HERE/dev-happy-path.postman_collection.json"
AUTH_COLLECTION="$HERE/dev-happy-path-auth.postman_collection.json"
ENVFILE="$HERE/dev.postman_environment.json"

echo "→ base URL: $DEV_BASE_URL"

env_args=(
  --env-var "DEV_BASE_URL=$DEV_BASE_URL"
  --env-var "DEV_API_KEY=$DEV_API_KEY"
  --env-var "JWT_SECRET=$JWT_SECRET"
)

optional_env_vars=(
  TEST_OWNER_USER_ID
  TEST_OWNER_EMAIL
  TEST_PET_ID
  TEST_NGO_ID
  PUBLIC_NGO_ID
  PUBLIC_NGO_ID_ALT
  DEV_REFRESH_TOKEN
  TEST_TAG_ID
  ORDER_VERIFICATION_TAG_ID
  ORDER_VERIFICATION_ID
  ORDER_ID
  ORDER_TEMP_ID
  NGO_USER_ID
  NGO_USER_EMAIL
  NGO_OWNED_PET_ID
  NGO_TRANSFER_TARGET_EMAIL
  NGO_TRANSFER_TARGET_PHONE
  PET_BIOMETRIC_ACCESS_SECRET
  PET_BIOMETRIC_SECRET_KEY
  SF_TYPE_ID
  SF_AREA_ID
  SF_NET_CODE
  SF_WAYBILL_NO
  TEST_IMAGE_URL
  TEST_IMAGE_FILE
  DEV_EMAIL_TEST_ADDRESS
  DEV_SMS_TEST_PHONE
)

for key in "${optional_env_vars[@]}"; do
  value="${!key-}"
  if [[ -n "$value" ]]; then
    env_args+=(--env-var "$key=$value")
  fi
done

run() {
  local name="$1" file="$2"
  echo
  echo "════════════════════════════════════════════════════════════════"
  echo "  $name"
  echo "════════════════════════════════════════════════════════════════"
  postman collection run "$file" \
    -e "$ENVFILE" \
    "${env_args[@]}" \
    "$@"
}

# Allow selecting a single suite: ./run-dev-happy-path.sh public | auth | all
MODE="${1:-all}"
shift || true

case "$MODE" in
  public) run "Public smoke" "$PUBLIC_COLLECTION" "$@" ;;
  auth)   run "Authenticated smoke" "$AUTH_COLLECTION" "$@" ;;
  all|"") run "Public smoke" "$PUBLIC_COLLECTION" "$@" ; run "Authenticated smoke" "$AUTH_COLLECTION" "$@" ;;
  *)
    # Treat as passthrough arg (e.g. --verbose) → run all
    run "Public smoke" "$PUBLIC_COLLECTION" "$MODE" "$@"
    run "Authenticated smoke" "$AUTH_COLLECTION" "$MODE" "$@"
    ;;
esac
