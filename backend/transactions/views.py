from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .analytics_service import build_analytics_for_user
from .cash_flow_service import build_cash_flow_for_user
from .reports_service import build_reports_for_user
from .models import Transaction
from .serializers import TransactionSerializer


class TransactionViewSet(viewsets.ModelViewSet):
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Transaction.objects.filter(user=self.request.user)

    @action(detail=False, methods=["get"], url_path="analytics")
    def analytics(self, request):
        preset = request.query_params.get("range", "last_6_months")
        start_s = request.query_params.get("start_date")
        end_s = request.query_params.get("end_date")
        data = build_analytics_for_user(request.user, preset, start_s, end_s)
        return Response(data)

    @action(detail=False, methods=["get"], url_path="cash-flow")
    def cash_flow(self, request):
        preset = request.query_params.get("range", "last_6_months")
        start_s = request.query_params.get("start_date")
        end_s = request.query_params.get("end_date")
        data = build_cash_flow_for_user(request.user, preset, start_s, end_s)
        return Response(data)

    @action(detail=False, methods=["get"], url_path="reports")
    def reports(self, request):
        preset = request.query_params.get("range", "last_6_months")
        start_s = request.query_params.get("start_date")
        end_s = request.query_params.get("end_date")
        data = build_reports_for_user(request.user, preset, start_s, end_s)
        return Response(data)

    @action(detail=False, methods=["get"], url_path="operations")
    def operations(self, request):
        from .operations_service import build_operations_for_user
        preset = request.query_params.get("range", "last_6_months")
        start_s = request.query_params.get("start_date")
        end_s = request.query_params.get("end_date")
        data = build_operations_for_user(request.user, preset, start_s, end_s)
        return Response(data)

    @action(detail=False, methods=["post"])
    def bulk_import(self, request):
        rows = request.data
        if not isinstance(rows, list):
            return Response(
                {"detail": "Request body must be a JSON array of transaction objects."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(rows) == 0:
            return Response(
                {"detail": "No rows to import."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created = []
        errors = []
        for index, row in enumerate(rows):
            ser = TransactionSerializer(data=row, context={"request": request})
            if ser.is_valid():
                ser.save()
                created.append(ser.data)
            else:
                errors.append({"row": index + 1, "data": row, "errors": ser.errors})

        payload = {
            "created_count": len(created),
            "error_count": len(errors),
            "created": created,
            "errors": errors,
            "message": (
                f"Imported {len(created)} transaction(s)."
                + (f" {len(errors)} row(s) skipped due to validation errors." if errors else "")
            ),
        }
        if not created and errors:
            return Response(payload, status=status.HTTP_400_BAD_REQUEST)
        if created and errors:
            return Response(payload, status=status.HTTP_200_OK)
        return Response(payload, status=status.HTTP_201_CREATED)
