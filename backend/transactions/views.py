from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from .models import Transaction
from .serializers import TransactionSerializer
import datetime

class TransactionViewSet(viewsets.ModelViewSet):
    serializer_class = TransactionSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        if self.request.user.is_authenticated:
            return Transaction.objects.filter(user=self.request.user)
        return Transaction.objects.all()

    @action(detail=False, methods=['get'])
    def analytics(self, request):
        range_type = request.query_params.get('range', 'last_6_months')
        today = datetime.date.today()
        
        if range_type == 'ytd':
            start_date = datetime.date(today.year, 1, 1)
            end_date = today
        elif range_type == 'custom':
            start_str = request.query_params.get('start_date')
            end_str = request.query_params.get('end_date')
            try:
                start_date = datetime.datetime.strptime(start_str, "%Y-%m-%d").date()
                end_date = datetime.datetime.strptime(end_str, "%Y-%m-%d").date()
            except (ValueError, TypeError):
                start_date = today - datetime.timedelta(days=30)
                end_date = today
        else: # last_6_months
            month = today.month - 5
            year = today.year
            if month <= 0:
                month += 12
                year -= 1
            start_date = datetime.date(year, month, 1)
            end_date = today

        qs = self.get_queryset().filter(date__gte=start_date, date__lte=end_date)
        
        gross_revenue = 0.0
        total_expense = 0.0
        
        monthly_data = {}
        curr = start_date.replace(day=1)
        end_month = end_date.replace(day=1)
        
        while curr <= end_month:
            k = curr.strftime("%Y-%m")
            monthly_data[k] = {'month': curr.strftime("%b"), 'year': curr.year, 'revenue': 0.0, 'expense': 0.0, 'profit': 0.0}
            m = curr.month + 1
            y = curr.year
            if m > 12:
                m = 1
                y += 1
            curr = datetime.date(y, m, 1)

        categories = {}

        for t in qs:
            val = float(abs(t.amount))
            is_expense = t.transaction_type.lower() == 'expense' or float(t.amount) < 0
            
            k = t.date.strftime("%Y-%m")
            if k in monthly_data:
                if is_expense:
                    monthly_data[k]['expense'] += val
                else:
                    monthly_data[k]['revenue'] += val

            if is_expense:
                total_expense += val
                cat = t.category or 'Uncategorized'
                categories[cat] = categories.get(cat, 0.0) + val
            else:
                gross_revenue += val

        for k in monthly_data:
            monthly_data[k]['profit'] = monthly_data[k]['revenue'] - monthly_data[k]['expense']

        allocation = []
        if total_expense > 0:
            for cat, val in categories.items():
                allocation.append({
                    'category': cat,
                    'amount': val,
                    'percentage': (val / total_expense) * 100
                })
        allocation = sorted(allocation, key=lambda x: x['amount'], reverse=True)
        monthly_trend = list(monthly_data.values())

        return Response({
            'gross_revenue': gross_revenue,
            'total_expense': total_expense,
            'monthly_trend': monthly_trend,
            'expense_allocation': allocation,
            'period_start': start_date.strftime("%Y-%m-%d"),
            'period_end': end_date.strftime("%Y-%m-%d"),
        })

    @action(detail=False, methods=['post'])
    def bulk_import(self, request):
        data = request.data
        if not isinstance(data, list):
            return Response({'error': 'Expected a list of items'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = self.get_serializer(data=data, many=True)
        if serializer.is_valid():
            serializer.save()
            return Response({'message': f'Successfully imported {len(data)} transactions'}, status=status.HTTP_201_CREATED)
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
