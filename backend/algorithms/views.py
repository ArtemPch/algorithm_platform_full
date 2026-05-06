from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from .models import Algorithm, AlgorithmPurchase, AlgorithmPricePoint
from .serializers import AlgorithmSerializer
from .compile_service import run_code
from users.services.roles import is_moderator

MAX_REQUEST_CODE_CHARS = 50000
MAX_REQUEST_STDIN_CHARS = 10000


class IsModerator(permissions.BasePermission):
    """
    Разрешение: только модераторы (staff/superuser или в группе модераторов).
    """
    def has_permission(self, request, view):
        return bool(is_moderator(getattr(request, "user", None)))

class AlgorithmList(generics.ListCreateAPIView):
    """
    GET: список алгоритмов (фильтрация: q)
    POST: создание алгоритма (автор берётся из request.user)
    """
    serializer_class = AlgorithmSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        queryset = Algorithm.objects.all()
        query = self.request.query_params.get('q')
        user = self.request.user

        if not user.is_authenticated:
            queryset = queryset.filter(status=Algorithm.STATUS_APPROVED)
        else:
            if not is_moderator(user):
                queryset = queryset.filter(
                    Q(status=Algorithm.STATUS_APPROVED) | Q(author_name=user.username)
                )

        if query:
            queryset = queryset.filter(
                Q(name__icontains=query) |
                Q(tegs__icontains=query) |
                Q(description__icontains=query) |
                Q(author_name__icontains=query)
            )

        return queryset.order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(status=Algorithm.STATUS_PENDING)

class AlgorithmDetail(generics.RetrieveUpdateDestroyAPIView):
    """
    Просмотр / редактирование / удаление алгоритма.
    Правило: только автор может редактировать/удалять; модераторы имеют отдельные endpoints для модерации.
    """
    queryset = Algorithm.objects.all()
    serializer_class = AlgorithmSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        queryset = Algorithm.objects.all()
        user = self.request.user

        if not user.is_authenticated:
            queryset = queryset.filter(status=Algorithm.STATUS_APPROVED)
        else:
            if not is_moderator(user):
                queryset = queryset.filter(Q(status=Algorithm.STATUS_APPROVED) | Q(author_name=user.username))
        return queryset

    def update(self, request, *args, **kwargs):
        algorithm = self.get_object()
        if not algorithm.can_edit(request.user):
            return Response({'detail': 'У вас нет прав для редактирования этого алгоритма.'}, status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        algorithm = self.get_object()
        if not algorithm.can_edit(request.user):
            return Response({'detail': 'У вас нет прав для удаления этого алгоритма.'}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def purchase_algorithm(request, pk):
    """
    Заглушка оплаты: при успешном запросе фиксируем покупку и возвращаем алгоритм с кодом.
    """
    algorithm = get_object_or_404(Algorithm, pk=pk)
    if not algorithm.can_view(request.user):
        return Response({'detail': 'Алгоритм недоступен.'}, status=status.HTTP_404_NOT_FOUND)
    if algorithm.status != Algorithm.STATUS_APPROVED:
        return Response({'detail': 'Можно купить только одобренный алгоритм.'}, status=status.HTTP_400_BAD_REQUEST)
    if not algorithm.is_paid:
        return Response({'detail': 'Этот алгоритм бесплатный, покупка не требуется.'}, status=status.HTTP_400_BAD_REQUEST)
    if algorithm.author_name == request.user.username:
        return Response({'detail': 'Нельзя купить собственный алгоритм.'}, status=status.HTTP_400_BAD_REQUEST)

    price = int(algorithm.price or 0)
    purchase, created = AlgorithmPurchase.objects.get_or_create(
        user=request.user,
        algorithm=algorithm,
        defaults={'purchase_price': price},
    )
    if not created and purchase.purchase_price == 0 and price:
        purchase.purchase_price = price
        purchase.save(update_fields=['purchase_price'])

    serializer = AlgorithmSerializer(algorithm, context={'request': request})
    return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def algorithm_price_history(request, pk):
    """
    История цены платного алгоритма (для графика). Доступ как у карточки алгоритма.
    """
    algorithm = get_object_or_404(Algorithm, pk=pk)
    if not algorithm.can_view(request.user):
        return Response({'detail': 'Алгоритм не найден.'}, status=status.HTTP_404_NOT_FOUND)
    if not algorithm.is_paid:
        return Response([])
    points = AlgorithmPricePoint.objects.filter(algorithm=algorithm).order_by('recorded_at')
    return Response(
        [{'recorded_at': p.recorded_at.isoformat(), 'price': p.price} for p in points]
    )


@api_view(['GET'])
@permission_classes([IsModerator])
def moderation_list(request):
    """
    Список алгоритмов на модерации — доступен только модераторам.
    """
    pending_algorithms = Algorithm.objects.filter(status=Algorithm.STATUS_PENDING).order_by('created_at')
    serializer = AlgorithmSerializer(pending_algorithms, many=True, context={'request': request})
    return Response(serializer.data)

@api_view(['POST'])
@permission_classes([IsModerator])
def moderate_algorithm(request, algorithm_id):
    """
    Endpoint для модерации: установить approved/rejected + указать причину.
    """
    try:
        algorithm = Algorithm.objects.get(id=algorithm_id, status=Algorithm.STATUS_PENDING)
    except Algorithm.DoesNotExist:
        return Response({'detail': 'Алгоритм не найден или уже прошел модерацию.'}, status=status.HTTP_404_NOT_FOUND)

    status_action = request.data.get('status')
    rejection_reason = request.data.get('rejection_reason', '')

    if status_action not in [Algorithm.STATUS_APPROVED, Algorithm.STATUS_REJECTED]:
        return Response({'detail': 'Неверный статус. Допустимые значения: "approved", "rejected".'}, status=status.HTTP_400_BAD_REQUEST)

    algorithm.status = status_action
    algorithm.rejection_reason = rejection_reason if status_action == Algorithm.STATUS_REJECTED else ''
    algorithm.moderated_by = request.user
    algorithm.moderated_at = timezone.now()
    algorithm.save()

    serializer = AlgorithmSerializer(algorithm, context={'request': request})
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def run_algorithm(request, pk):
    """
    Запуск алгоритма.
    Если язык компилируемый — компилирует перед запуском (прозрачно для клиента).
    """
    algorithm = get_object_or_404(Algorithm, pk=pk)
    if not algorithm.can_view_code(request.user):
        return Response({'detail': 'Код алгоритма недоступен.'}, status=status.HTTP_404_NOT_FOUND)

    language = request.data.get('language') or algorithm.language or ''
    code = request.data.get('code') if request.data.get('code') is not None else algorithm.code

    stdin = request.data.get('stdin') or ""
    if len(code or "") > MAX_REQUEST_CODE_CHARS:
        return Response(
            {'detail': f'Код слишком большой. Максимум {MAX_REQUEST_CODE_CHARS} символов.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if len(stdin or "") > MAX_REQUEST_STDIN_CHARS:
        return Response(
            {'detail': f'Слишком большой stdin. Максимум {MAX_REQUEST_STDIN_CHARS} символов.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    compiler = request.data.get('compiler') or algorithm.compiler or None

    # лимиты можно переопределять из запроса (для тестов/локальной отладки),
    # но держим жёсткие “потолки”, чтобы не дать выкрутить на бесконечность.
    def _clamp_int(val, default, lo, hi):
        try:
            n = int(val)
        except Exception:
            n = default
        return max(lo, min(hi, n))

    compile_timeout_s = _clamp_int(request.data.get('compile_timeout_s'), 10, 1, 30)
    run_timeout_s = _clamp_int(request.data.get('run_timeout_s'), 2, 1, 5)
    memory_mb = _clamp_int(request.data.get('memory_mb'), 256, 64, 1024)

    compile_res, run_res = run_code(
        language=language,
        code=code,
        stdin=stdin,
        compiler=compiler,
        compile_timeout_s=compile_timeout_s,
        run_timeout_s=run_timeout_s,
        memory_mb=memory_mb,
    )
    compiled = bool(compile_res.compiled)
    return Response(
        {
            'compiled': compiled,
            'ran': bool(run_res.ran) if compiled else False,
            'stdout': run_res.stdout if compiled else '',
            'stderr': run_res.stderr if compiled else compile_res.stderr,
            'compile_exit_code': compile_res.exit_code,
            'run_exit_code': run_res.exit_code if compiled else None,
        }
    )


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def run_snippet(request):
    """
    Запуск “черновика” без сохранения Algorithm.
    Если язык компилируемый — компилирует перед запуском (прозрачно для клиента).
    """
    language = request.data.get('language') or ''
    code = request.data.get('code')
    if code is None or language is None:
        return Response(
            {'detail': 'Поля "code" и "language" обязательны.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    stdin = request.data.get('stdin') or ""
    compiler = request.data.get('compiler') or None

    if len(code or "") > MAX_REQUEST_CODE_CHARS:
        return Response(
            {'detail': f'Код слишком большой. Максимум {MAX_REQUEST_CODE_CHARS} символов.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if len(stdin or "") > MAX_REQUEST_STDIN_CHARS:
        return Response(
            {'detail': f'Слишком большой stdin. Максимум {MAX_REQUEST_STDIN_CHARS} символов.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    def _clamp_int(val, default, lo, hi):
        try:
            n = int(val)
        except Exception:
            n = default
        return max(lo, min(hi, n))

    compile_timeout_s = _clamp_int(request.data.get('compile_timeout_s'), 10, 1, 30)
    run_timeout_s = _clamp_int(request.data.get('run_timeout_s'), 2, 1, 5)
    memory_mb = _clamp_int(request.data.get('memory_mb'), 256, 64, 1024)

    compile_res, run_res = run_code(
        language=language,
        code=code,
        stdin=stdin,
        compiler=compiler,
        compile_timeout_s=compile_timeout_s,
        run_timeout_s=run_timeout_s,
        memory_mb=memory_mb,
    )
    compiled = bool(compile_res.compiled)
    return Response(
        {
            'compiled': compiled,
            'ran': bool(run_res.ran) if compiled else False,
            'stdout': run_res.stdout if compiled else '',
            'stderr': run_res.stderr if compiled else compile_res.stderr,
            'compile_exit_code': compile_res.exit_code,
            'run_exit_code': run_res.exit_code if compiled else None,
        }
    )
